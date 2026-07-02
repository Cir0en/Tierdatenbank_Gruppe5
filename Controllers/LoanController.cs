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
/// eine Leihe verändern/löschen. Ausleihe- und Rückgabe-Konflikte werden sowohl auf Anwendungsebene
/// (Statusprüfung vor dem Insert) als auch durch einen DB-seitigen Unique-Index abgesichert, um
/// Race-Conditions bei gleichzeitigen Anfragen auszuschließen.
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

        var loans = await _context.Loans
            .Where(l => l.LenderId == currentUser.Id || l.BorrowerId == currentUser.Id)
            .Select(l => new LoanDetailDto
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
            })
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

        var loan = await _context.Loans
            .Where(l => l.Id == id && (l.LenderId == currentUser.Id || l.BorrowerId == currentUser.Id))
            .Select(l => new LoanDetailDto
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
            })
            .FirstOrDefaultAsync();

        if (loan == null) return NotFound();
        return Ok(loan);
    }

    // GET /api/loan/my-objects — alle Objekte des aktuellen Nutzers (für Auswahlmenü)
    [HttpGet("my-objects")]
    public async Task<IActionResult> GetMyObjects()
    {
        var currentUser = await GetCurrentUserAsync();
        if (currentUser == null) return Unauthorized();

        var items = await _context.CollectItems
            .Where(i => i.Collection != null && i.Collection.UserId == currentUser.Id)
            .Select(i => new { i.Id, i.Name, CollectionName = i.Collection != null ? i.Collection.Name : null })
            .OrderBy(i => i.Name)
            .ToListAsync();

        return Ok(items);
    }

    // GET /api/loan/users — alle anderen Nutzer (für Entleiher-Auswahl)
    [HttpGet("users")]
    public async Task<IActionResult> GetUsers()
    {
        var currentUser = await GetCurrentUserAsync();
        if (currentUser == null) return Unauthorized();

        var users = await _context.Users
            .Where(u => u.Id != currentUser.Id && u.Role != "Inaktiv")
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

        // Verfügbarkeitsprüfung: Objekt darf nicht bereits aktiv verliehen sein.
        // Schließt den Race-Window nicht vollständig (siehe Unique-Index unten für den harten Schutz),
        // liefert aber im Normalfall sofort eine verständliche Fehlermeldung statt einer DB-Exception.
        var alreadyLoaned = await _context.Loans
            .AnyAsync(l => l.ObjectId == dto.ObjectId && l.Status == "offen");
        if (alreadyLoaned)
            return Conflict(new { message = "Dieses Objekt ist bereits aktiv verliehen." });

        var loan = new Loan
        {
            ObjectId   = dto.ObjectId,
            LenderId   = currentUser.Id,
            BorrowerId = dto.BorrowerId,
            StartDate  = dto.StartDate,
            EndDate    = dto.EndDate,
            Status     = "offen"
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

    // GET /api/loan/allowed-status — erlaubte Statuswerte aus DB-Constraint auslesen
    [HttpGet("allowed-status")]
    public async Task<IActionResult> GetAllowedStatus()
    {
        var conn = _context.Database.GetDbConnection();
        await conn.OpenAsync();
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            SELECT pg_get_constraintdef(oid)
            FROM pg_constraint
            WHERE conname = 'loans_status_check'
            LIMIT 1;
            """;
        var result = await cmd.ExecuteScalarAsync();
        await conn.CloseAsync();
        return Ok(new { constraintDef = result?.ToString() });
    }

    // PUT /api/loan/{id}/status — Status aktualisieren (nur Verleiher)
    [HttpPut("{id:int}/status")]
    public async Task<IActionResult> UpdateStatus(int id, UpdateLoanStatusDto dto)
    {
        var currentUser = await GetCurrentUserAsync();
        if (currentUser == null) return Unauthorized();

        var loan = await _context.Loans.FindAsync(id);
        if (loan == null) return NotFound();

        if (loan.LenderId != currentUser.Id)
            return Forbid();

        var allowed = new[] { "offen", "zurückgegeben" };
        if (!allowed.Contains(dto.Status))
            return BadRequest(new { message = "Ungültiger Status. Erlaubt: offen, zurückgegeben." });

        loan.Status = dto.Status;
        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException pg && pg.SqlState == "23514")
        {
            return BadRequest(new { message = $"Dieser Status ist in der Datenbank nicht erlaubt. DB-Constraint: {pg.ConstraintName}" });
        }

        return NoContent();
    }

    // DELETE /api/loan/{id} — Leihe löschen (nur Verleiher)
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> DeleteLoan(int id)
    {
        var currentUser = await GetCurrentUserAsync();
        if (currentUser == null) return Unauthorized();

        var loan = await _context.Loans.FindAsync(id);
        if (loan == null) return NotFound();

        if (loan.LenderId != currentUser.Id)
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
}
