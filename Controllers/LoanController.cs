using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TodoApi.Models;
using TodoApi.DTOs;
using Npgsql;

namespace TodoApi.Controllers;

/// <summary>
/// Verwaltet Ausleihen (Loans) von Fundobjekten zwischen Nutzern. Ein Objekt kann jeweils nur
/// von seinem Eigentümer (über die zugehörige Collection) verliehen werden; nur der Verleiher darf
/// eine Leihe verändern/löschen. Jede Leihe durchläuft zwei Freigabestufen, bevor sie aktiv wird
/// ("offen"): zunächst der Verleiher (direkt bei CreateLoan, oder durch Bestätigung einer Anfrage
/// über Approve), danach zwingend ein Moderator/Admin als zweite, unabhängige Instanz (Moderate-
/// Approve/-Reject) — dieser Schritt gilt für beide Wege gleichermaßen. Ausleihe- und Rückgabe-
/// Konflikte werden sowohl auf Anwendungsebene (Statusprüfung vor dem Insert) als auch durch einen
/// DB-seitigen Unique-Index abgesichert, um Race-Conditions bei gleichzeitigen Anfragen auszuschließen.
/// Erfordert eine gültige Clerk-JWT-Authentifizierung (<see cref="AuthorizeAttribute"/>); die
/// Nutzeridentität wird ausschließlich aus dem validierten "sub"-Claim abgeleitet (siehe
/// <see cref="GetCurrentUserAsync"/>), damit sich niemand über einen manipulierten Client-Header
/// als anderer Nutzer ausgeben kann.
/// </summary>
[ApiController]
[Route("api/loan")]
[Authorize]
public class LoanController : ControllerBase
{
    private readonly NeondbContext _context;

    public LoanController(NeondbContext context)
    {
        _context = context;
    }

    // GET /api/loan — alle Leihen des aktuellen Nutzers (als Verleiher oder Entleiher)
    [HttpGet]
    public async Task<ActionResult<IEnumerable<LoanDetailDto>>> GetLoans()
    {
        var currentUser = await GetCurrentUserAsync();
        if (currentUser == null) return Unauthorized();

        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var loans = await ProjectLoans(
                _context.Loans.Where(l => l.LenderId == currentUser.Id || l.BorrowerId == currentUser.Id),
                today)
            .OrderByDescending(l => l.Id)
            .ToListAsync();

        return Ok(loans);
    }

    // GET /api/loan/{id}
    [HttpGet("{id:int}")]
    public async Task<ActionResult<LoanDetailDto>> GetLoan(int id)
    {
        var currentUser = await GetCurrentUserAsync();
        if (currentUser == null) return Unauthorized();

        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var loan = await ProjectLoans(
                _context.Loans.Where(l => l.Id == id && (l.LenderId == currentUser.Id || l.BorrowerId == currentUser.Id)),
                today)
            .FirstOrDefaultAsync();

        if (loan == null) return NotFound();
        return Ok(loan);
    }

    // Gemeinsame Projektion von Loan -> LoanDetailDto (inkl. Namen der beteiligten Nutzer/Objekte
    // und berechnetem Überfälligkeitsstatus), damit GetLoans/GetLoan/ExtendLoan nicht denselben
    // Select-Ausdruck duplizieren müssen.
    private static IQueryable<LoanDetailDto> ProjectLoans(IQueryable<Loan> query, DateOnly today) =>
        query.Select(l => new LoanDetailDto
        {
            Id              = l.Id,
            ObjectId        = l.ObjectId,
            ObjectName      = l.Object != null ? l.Object.Name : null,
            LenderId        = l.LenderId,
            LenderName      = l.Lender != null ? l.Lender.Username : null,
            LenderFirstName = l.Lender != null ? l.Lender.FirstName : null,
            LenderLastName  = l.Lender != null ? l.Lender.LastName  : null,
            BorrowerId        = l.BorrowerId,
            BorrowerName      = l.Borrower != null ? l.Borrower.Username : null,
            BorrowerFirstName = l.Borrower != null ? l.Borrower.FirstName : null,
            BorrowerLastName  = l.Borrower != null ? l.Borrower.LastName  : null,
            StartDate  = l.StartDate,
            EndDate    = l.EndDate,
            Status     = l.Status,
            // überfällig: Leihe ist noch offen, hat ein Enddatum und dieses liegt in der Vergangenheit
            IsOverdue  = l.Status == "offen" && l.EndDate != null && l.EndDate < today
        });

    // GET /api/loan/my-objects — alle Objekte des aktuellen Nutzers (für Auswahlmenü), inkl.
    // IsOnLoan-Flag, damit das Frontend bereits verliehene Objekte in der Auswahl sperren kann,
    // statt den Nutzer erst beim Absenden mit einem 409-Konflikt zu konfrontieren.
    [HttpGet("my-objects")]
    public async Task<IActionResult> GetMyObjects()
    {
        var currentUser = await GetCurrentUserAsync();
        if (currentUser == null) return Unauthorized();

        var items = await _context.CollectItems
            .Where(i => i.Collection != null && i.Collection.UserId == currentUser.Id)
            .Select(i => new
            {
                i.Id,
                i.Name,
                CollectionName = i.Collection != null ? i.Collection.Name : null,
                IsOnLoan = i.Loans.Any(l => l.Status == "offen" || l.Status == "in_pruefung")
            })
            .OrderBy(i => i.Name)
            .ToListAsync();

        return Ok(items);
    }

    // GET /api/loan/users — alle anderen Nutzer (für Entleiher-Auswahl); gebannte und
    // (soft-)gelöschte Nutzer werden ausgeschlossen, da an sie nicht sinnvoll verliehen werden kann.
    [HttpGet("users")]
    public async Task<IActionResult> GetUsers()
    {
        var currentUser = await GetCurrentUserAsync();
        if (currentUser == null) return Unauthorized();

        var users = await _context.Users
            .Where(u => u.Id != currentUser.Id && !u.IsBanned && u.DeletedAt == null)
            .Select(u => new { u.Id, u.Username, u.FirstName, u.LastName, u.Institution })
            .OrderBy(u => u.Username)
            .ToListAsync();

        return Ok(users);
    }

    // POST /api/loan — neue Leihe anlegen
    [HttpPost]
    public async Task<ActionResult<LoanDetailDto>> CreateLoan(CreateLoanDto dto)
    {
        var currentUser = await GetCurrentUserAsync();
        if (currentUser == null) return Unauthorized();

        if (dto.EndDate <= dto.StartDate)
            return BadRequest(new { message = "Das Enddatum muss nach dem Startdatum liegen." });

        var obj = await _context.CollectItems
            .Include(c => c.Collection)
            .FirstOrDefaultAsync(c => c.Id == dto.ObjectId);

        if (obj == null)
            return NotFound(new { message = "Objekt nicht gefunden." });

        // nur der Eigentümer der Sammlung, in der sich das Objekt befindet, darf es verleihen
        if (obj.Collection?.UserId != currentUser.Id)
            return Forbid();

        var borrower = await _context.Users.FindAsync(dto.BorrowerId);
        if (borrower == null)
            return NotFound(new { message = "Entleiher nicht gefunden." });

        if (borrower.Id == currentUser.Id)
            return BadRequest(new { message = "Du kannst ein Objekt nicht an dich selbst verleihen." });

        // Verfügbarkeitsprüfung: Objekt darf nicht bereits aktiv verliehen oder in Prüfung sein.
        // Schließt den Race-Window nicht vollständig (siehe Unique-Index unten für den harten Schutz),
        // liefert aber im Normalfall sofort eine verständliche Fehlermeldung statt einer DB-Exception.
        var alreadyLoaned = await _context.Loans
            .AnyAsync(l => l.ObjectId == dto.ObjectId && (l.Status == "offen" || l.Status == "in_pruefung"));
        if (alreadyLoaned)
            return Conflict(new { message = "Dieses Objekt ist bereits aktiv verliehen oder in Prüfung." });

        // Der direkt angelegte Verleih überspringt die Anfrage-Warteschlange — noch offene Anfragen
        // anderer Nutzer für dasselbe Objekt werden daher automatisch abgelehnt.
        var otherPendingRequests = await _context.Loans
            .Where(l => l.ObjectId == dto.ObjectId && l.Status == "angefragt")
            .ToListAsync();
        foreach (var other in otherPendingRequests)
            other.Status = "abgelehnt";

        // Wie bei einer bestätigten Anfrage muss auch eine direkt angelegte Leihe noch von einem
        // Moderator/Admin als zweiter, unabhängiger Instanz freigegeben werden (siehe ModerateApprove).
        var loan = new Loan
        {
            ObjectId   = dto.ObjectId,
            LenderId   = currentUser.Id,
            BorrowerId = dto.BorrowerId,
            StartDate  = dto.StartDate,
            EndDate    = dto.EndDate,
            Status     = "in_pruefung"
        };

        _context.Loans.Add(loan);
        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException pg && pg.SqlState == "23505")
        {
            // Zwei parallele Requests haben den obigen Check gleichzeitig passiert;
            // der DB-seitige Unique-Index (idx_loans_object_open_unique) verhindert die doppelte Ausleihe.
            return Conflict(new { message = "Dieses Objekt wurde soeben von einer anderen Person ausgeliehen." });
        }

        var result = new LoanDetailDto
        {
            Id              = loan.Id,
            ObjectId        = loan.ObjectId,
            ObjectName      = obj.Name,
            LenderId        = loan.LenderId,
            LenderName      = currentUser.Username,
            LenderFirstName = currentUser.FirstName,
            LenderLastName  = currentUser.LastName,
            BorrowerId        = loan.BorrowerId,
            BorrowerName      = borrower.Username,
            BorrowerFirstName = borrower.FirstName,
            BorrowerLastName  = borrower.LastName,
            StartDate  = loan.StartDate,
            EndDate    = loan.EndDate,
            Status     = loan.Status,
            IsOverdue  = false
        };

        return CreatedAtAction(nameof(GetLoan), new { id = loan.Id }, result);
    }

    // POST /api/loan/request — ein Nutzer fragt an, ein fremdes Objekt auszuleihen (Gegenstück zu
    // CreateLoan oben, bei dem der Eigentümer die Leihe direkt anlegt). Legt status "angefragt" an;
    // der Eigentümer muss die Anfrage über Approve/Reject unten noch bestätigen bzw. ablehnen.
    [HttpPost("request")]
    public async Task<ActionResult<LoanDetailDto>> CreateLoanRequest(CreateLoanRequestDto dto)
    {
        var currentUser = await GetCurrentUserAsync();
        if (currentUser == null) return Unauthorized();

        if (dto.EndDate <= dto.StartDate)
            return BadRequest(new { message = "Das Enddatum muss nach dem Startdatum liegen." });

        var obj = await _context.CollectItems
            .Include(c => c.Collection)
            .FirstOrDefaultAsync(c => c.Id == dto.ObjectId);

        if (obj == null || obj.Collection?.UserId == null)
            return NotFound(new { message = "Objekt nicht gefunden." });

        // Nur Objekte aus öffentlichen Sammlungen dürfen angefragt werden — private Sammlungen
        // sind für andere Nutzer ohnehin nicht sichtbar, ihre Objekt-Ids sollen daher auch hier
        // nicht erraten/angefragt werden können.
        if (obj.Collection.IsPublic != true)
            return Forbid();

        var ownerId = obj.Collection.UserId.Value;
        if (ownerId == currentUser.Id)
            return BadRequest(new { message = "Du kannst dein eigenes Objekt nicht anfragen." });

        var alreadyLoaned = await _context.Loans
            .AnyAsync(l => l.ObjectId == dto.ObjectId && (l.Status == "offen" || l.Status == "in_pruefung"));
        if (alreadyLoaned)
            return Conflict(new { message = "Dieses Objekt ist bereits aktiv verliehen oder in Prüfung." });

        var alreadyRequested = await _context.Loans
            .AnyAsync(l => l.ObjectId == dto.ObjectId && l.BorrowerId == currentUser.Id && l.Status == "angefragt");
        if (alreadyRequested)
            return Conflict(new { message = "Du hast für dieses Objekt bereits eine offene Anfrage." });

        var loan = new Loan
        {
            ObjectId   = dto.ObjectId,
            LenderId   = ownerId,
            BorrowerId = currentUser.Id,
            StartDate  = dto.StartDate,
            EndDate    = dto.EndDate,
            Status     = "angefragt"
        };

        _context.Loans.Add(loan);
        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException pg && pg.SqlState == "23505")
        {
            return Conflict(new { message = "Dieses Objekt wurde soeben von einer anderen Person angefragt/verliehen." });
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException pg && pg.SqlState == "23514")
        {
            return StatusCode(500, new { message = "Dieser Status ist in der Datenbank nicht erlaubt — wurde die Migration sql/2026-07-16_add_loan_request_status.sql bereits gegen die DB ausgeführt?" });
        }

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var result = await ProjectLoans(_context.Loans.Where(l => l.Id == loan.Id), today).FirstAsync();
        return CreatedAtAction(nameof(GetLoan), new { id = loan.Id }, result);
    }

    // PUT /api/loan/{id}/approve — der Verleiher bestätigt eine Ausleih-Anfrage (status "angefragt" ->
    // "in_pruefung"). Die Leihe wird dadurch noch nicht aktiv: ein Moderator/Admin muss sie als
    // zweite, unabhängige Instanz noch freigeben (siehe ModerateApprove/-Reject unten). Andere noch
    // offene Anfragen für dasselbe Objekt werden dabei automatisch abgelehnt, da ein Objekt
    // zeitgleich nur einen aktiven Leihvorgang haben kann.
    [HttpPut("{id:int}/approve")]
    public async Task<ActionResult<LoanDetailDto>> ApproveLoanRequest(int id)
    {
        var currentUser = await GetCurrentUserAsync();
        if (currentUser == null) return Unauthorized();

        var loan = await _context.Loans.FindAsync(id);
        if (loan == null) return NotFound();

        if (loan.LenderId != currentUser.Id)
            return Forbid();

        if (loan.Status != "angefragt")
            return BadRequest(new { message = "Nur offene Anfragen können bestätigt werden." });

        loan.Status = "in_pruefung";

        var otherPending = await _context.Loans
            .Where(l => l.ObjectId == loan.ObjectId && l.Id != loan.Id && l.Status == "angefragt")
            .ToListAsync();
        foreach (var other in otherPending)
            other.Status = "abgelehnt";

        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException pg && pg.SqlState == "23505")
        {
            return Conflict(new { message = "Dieses Objekt wurde soeben bereits an eine andere Person verliehen." });
        }

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var result = await ProjectLoans(_context.Loans.Where(l => l.Id == id), today).FirstAsync();
        return Ok(result);
    }

    // PUT /api/loan/{id}/reject — der Verleiher lehnt eine Ausleih-Anfrage ab (status "angefragt" ->
    // "abgelehnt").
    [HttpPut("{id:int}/reject")]
    public async Task<IActionResult> RejectLoanRequest(int id)
    {
        var currentUser = await GetCurrentUserAsync();
        if (currentUser == null) return Unauthorized();

        var loan = await _context.Loans.FindAsync(id);
        if (loan == null) return NotFound();

        if (loan.LenderId != currentUser.Id)
            return Forbid();

        if (loan.Status != "angefragt")
            return BadRequest(new { message = "Nur offene Anfragen können abgelehnt werden." });

        loan.Status = "abgelehnt";
        await _context.SaveChangesAsync();

        return NoContent();
    }

    // GET /api/loan/pending-moderation — alle Leihen, die auf die Moderator/Admin-Freigabe warten
    // (status "in_pruefung"); zweite, vom Verleiher unabhängige Prüfinstanz vor der Aktivierung.
    [HttpGet("pending-moderation")]
    public async Task<ActionResult<IEnumerable<LoanDetailDto>>> GetPendingModeration()
    {
        var currentUser = await GetCurrentUserAsync();
        if (currentUser == null) return Unauthorized();
        if (!IsModerator(currentUser)) return Forbid();

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var loans = await ProjectLoans(_context.Loans.Where(l => l.Status == "in_pruefung"), today)
            .OrderBy(l => l.Id)
            .ToListAsync();

        return Ok(loans);
    }

    // PUT /api/loan/{id}/moderate-approve — ein Moderator/Admin gibt eine vom Verleiher bereits
    // bestätigte Leihe frei (status "in_pruefung" -> "offen"). Unabhängig davon, ob die Leihe direkt
    // vom Verleiher angelegt oder aus einer Anfrage heraus bestätigt wurde.
    [HttpPut("{id:int}/moderate-approve")]
    public async Task<ActionResult<LoanDetailDto>> ModerateApproveLoan(int id)
    {
        var currentUser = await GetCurrentUserAsync();
        if (currentUser == null) return Unauthorized();
        if (!IsModerator(currentUser)) return Forbid();

        var loan = await _context.Loans.FindAsync(id);
        if (loan == null) return NotFound();

        if (loan.Status != "in_pruefung")
            return BadRequest(new { message = "Nur Leihen in Prüfung können freigegeben werden." });

        loan.Status = "offen";
        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException pg && pg.SqlState == "23505")
        {
            return Conflict(new { message = "Für dieses Objekt existiert bereits eine andere aktive Leihe." });
        }

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var result = await ProjectLoans(_context.Loans.Where(l => l.Id == id), today).FirstAsync();
        return Ok(result);
    }

    // PUT /api/loan/{id}/moderate-reject — ein Moderator/Admin lehnt eine zur Prüfung stehende
    // Leihe ab (status "in_pruefung" -> "abgelehnt"), z.B. weil sie inhaltlich nicht plausibel ist.
    [HttpPut("{id:int}/moderate-reject")]
    public async Task<IActionResult> ModerateRejectLoan(int id)
    {
        var currentUser = await GetCurrentUserAsync();
        if (currentUser == null) return Unauthorized();
        if (!IsModerator(currentUser)) return Forbid();

        var loan = await _context.Loans.FindAsync(id);
        if (loan == null) return NotFound();

        if (loan.Status != "in_pruefung")
            return BadRequest(new { message = "Nur Leihen in Prüfung können abgelehnt werden." });

        loan.Status = "abgelehnt";
        await _context.SaveChangesAsync();

        return NoContent();
    }

    // PUT /api/loan/{id}/return — Leihe als zurückgegeben markieren (nur Verleiher, nur aus "offen").
    // Bewusst nur diese eine Richtung (kein "Reaktivieren" zurück auf "offen"): eine einmal
    // zurückgegebene Leihe ist abgeschlossen, für einen erneuten Verleih wird eine neue Ausleihe
    // angelegt (entspricht dem Vorgehen realer Verleihsysteme und vermeidet Verwirrung durch
    // nachträglich "wiederbelebte" historische Einträge).
    [HttpPut("{id:int}/return")]
    public async Task<IActionResult> ReturnLoan(int id)
    {
        var currentUser = await GetCurrentUserAsync();
        if (currentUser == null) return Unauthorized();

        var loan = await _context.Loans.FindAsync(id);
        if (loan == null) return NotFound();

        if (loan.LenderId != currentUser.Id)
            return Forbid();

        if (loan.Status != "offen")
            return BadRequest(new { message = "Nur offene Leihen können als zurückgegeben markiert werden." });

        loan.Status = "zurückgegeben";
        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException pg && pg.SqlState == "23514")
        {
            return BadRequest(new { message = "Dieser Status ist in der Datenbank nicht erlaubt." });
        }

        return NoContent();
    }

    // PUT /api/loan/{id}/extend — Rückgabedatum einer aktiven Leihe nach hinten verschieben
    // (typische "Verlängern"-Funktion). Nur der Verleiher darf verlängern, nur bei Status "offen",
    // und nur auf ein Datum nach dem bisherigen Rückgabedatum (sonst wäre es keine Verlängerung).
    [HttpPut("{id:int}/extend")]
    public async Task<ActionResult<LoanDetailDto>> ExtendLoan(int id, ExtendLoanDto dto)
    {
        var currentUser = await GetCurrentUserAsync();
        if (currentUser == null) return Unauthorized();

        var loan = await _context.Loans.FindAsync(id);
        if (loan == null) return NotFound();

        if (loan.LenderId != currentUser.Id)
            return Forbid();

        if (loan.Status != "offen")
            return BadRequest(new { message = "Nur aktive Leihen können verlängert werden." });

        if (loan.EndDate != null && dto.NewEndDate <= loan.EndDate)
            return BadRequest(new { message = "Das neue Rückgabedatum muss nach dem bisherigen liegen." });

        loan.EndDate = dto.NewEndDate;
        await _context.SaveChangesAsync();

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var result = await ProjectLoans(_context.Loans.Where(l => l.Id == id), today).FirstAsync();
        return Ok(result);
    }

    // DELETE /api/loan/{id} — Leihe löschen. Der Verleiher darf jede eigene Leihe löschen; der
    // Entleiher darf zusätzlich eine eigene, noch unbestätigte Anfrage (status "angefragt")
    // zurückziehen, ohne auf eine Reaktion des Verleihers warten zu müssen.
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> DeleteLoan(int id)
    {
        var currentUser = await GetCurrentUserAsync();
        if (currentUser == null) return Unauthorized();

        var loan = await _context.Loans.FindAsync(id);
        if (loan == null) return NotFound();

        var isLender = loan.LenderId == currentUser.Id;
        var isOwnPendingRequest = loan.BorrowerId == currentUser.Id && loan.Status == "angefragt";
        if (!isLender && !isOwnPendingRequest)
            return Forbid();

        _context.Loans.Remove(loan);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    // Ermittelt den aktuell angemeldeten Nutzer über den Clerk-Header (Frontend ohne JWT)
    // oder alternativ über das "sub"-Claim des JWT; gibt null zurück, wenn beides fehlt.
    // Liest die Nutzeridentität ausschließlich aus dem "sub"-Claim des validierten JWT
    // (durch [Authorize] + JwtBearer-Middleware bereits geprüft). Es gibt bewusst KEINEN
    // Fallback auf einen Client-Header mehr — ein solcher Header wäre ungeprüft vom Client
    // frei wählbar und hätte eine Impersonation anderer Nutzer erlaubt.
    private async Task<User?> GetCurrentUserAsync()
    {
        var clerkId = User.FindFirst("sub")?.Value;
        if (string.IsNullOrWhiteSpace(clerkId))
            return null;
        return await _context.Users.FirstOrDefaultAsync(u => u.ClerkId == clerkId);
    }

    private static bool IsModerator(User user) => user.Role == "Admin" || user.Role == "Moderator";
}
