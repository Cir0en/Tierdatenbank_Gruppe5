using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TodoApi.Models;
using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Authorization;
using TodoApi.DTOs;

namespace TodoApi.Controllers;

/// <summary>
/// Verwaltet Benutzerkonten: eigene Rolle abfragen, Nutzerliste, Rollenänderung, Sperren/Entsperren
/// sowie Löschen (Soft-Delete/Anonymisierung). Erfordert grundsätzlich Anmeldung ([Authorize]);
/// die meisten administrativen Aktionen (Rolle ändern, sperren, löschen) sind zusätzlich auf die
/// Rolle Admin beschränkt (siehe <see cref="GetCurrentAdminAsync"/>). Rollen-/Sperr-/Löschänderungen
/// werden immer sowohl lokal in der DB als auch bei Clerk (Auth-Provider) synchronisiert.
/// </summary>
[ApiController]
[Route("api/users")]
[Authorize]
public class UsersController : ControllerBase
{
    private readonly NeondbContext _db;
    private readonly IHttpClientFactory _httpClientFactory;

    public UsersController(NeondbContext db,
        IHttpClientFactory httpClientFactory)
    {
        _db = db;
        _httpClientFactory = httpClientFactory;
    }

    // Ermittelt den aktuell angemeldeten Nutzer und prüft, ob er die Rolle Admin hat sowie
    // weder gebannt noch (soft-)gelöscht ist. Gibt null zurück, wenn keine Admin-Berechtigung besteht.
    private async Task<User?> GetCurrentAdminAsync()
    {
        var clerkId = User.FindFirst("sub")?.Value;

        if (string.IsNullOrWhiteSpace(clerkId))
            return null;

        return await _db.Users.FirstOrDefaultAsync(user =>
            user.ClerkId == clerkId &&
            user.Role == "Admin" &&
            !user.IsBanned &&
            user.DeletedAt == null);
    }

    // GET /api/users/me — eigene Rolle aus Neon-DB lesen (für Navbar)
    [HttpGet("me")]
    public async Task<IActionResult> GetMe()
    {
        var clerkId = User.FindFirst("sub")?.Value;
        if (string.IsNullOrWhiteSpace(clerkId)) return Unauthorized();

        var me = await _db.Users
            .Where(u => u.ClerkId == clerkId && u.DeletedAt == null)
            .Select(u => new { u.Id, u.Role, u.Username, u.FirstName, u.LastName, u.IsBanned, u.Email, u.Institution, u.CreatedAt })
            .FirstOrDefaultAsync();

        if (me == null) return NotFound();
        return Ok(me);
    }

    // PUT /api/users/me — eigenes Profil (Benutzername/Institution) bearbeiten. Der Benutzername wird
    // zusätzlich bei Clerk aktualisiert, da er sonst beim nächsten "user.updated"-Webhook (z.B. nach
    // einem Passwort-Wechsel) wieder mit dem alten Clerk-Wert überschrieben würde (siehe
    // ClerkWebhookController).
    [HttpPut("me")]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileDto dto)
    {
        var clerkId = User.FindFirst("sub")?.Value;
        if (string.IsNullOrWhiteSpace(clerkId)) return Unauthorized();

        var user = await _db.Users.FirstOrDefaultAsync(u => u.ClerkId == clerkId && u.DeletedAt == null);
        if (user == null) return NotFound("Benutzer wurde nicht gefunden.");

        var username = dto.Username?.Trim();
        if (string.IsNullOrWhiteSpace(username) || username.Length < 3)
            return BadRequest("Der Benutzername muss mindestens 3 Zeichen lang sein.");

        var institution = string.IsNullOrWhiteSpace(dto.Institution) ? null : dto.Institution.Trim();

        if (!string.Equals(username, user.Username, StringComparison.Ordinal))
        {
            var taken = await _db.Users.AnyAsync(u => u.Id != user.Id && u.Username == username);
            if (taken) return BadRequest("Dieser Benutzername ist bereits vergeben.");

            var clerkClient = _httpClientFactory.CreateClient("Clerk");
            var clerkResponse = await clerkClient.PatchAsJsonAsync(
                $"users/{Uri.EscapeDataString(user.ClerkId)}",
                new { username });

            if (!clerkResponse.IsSuccessStatusCode)
            {
                var body = await clerkResponse.Content.ReadAsStringAsync();
                return StatusCode(
                    StatusCodes.Status502BadGateway,
                    $"Der Benutzername konnte nicht übernommen werden (evtl. ungültiges Format oder bereits vergeben). {body}");
            }

            user.Username = username;
        }

        user.Institution = institution;
        await _db.SaveChangesAsync();

        return Ok(new { user.Id, user.Username, user.Institution });
    }

    // GET /api/users — alle Benutzer (nur Admin)
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var admin = await GetCurrentAdminAsync();

        if (admin == null)
            return Forbid();

        var users = await _db.Users
            .Where(user => user.DeletedAt == null)
            .OrderBy(user => user.CreatedAt)
            .Select(user => new
            {
                user.Id,
                user.ClerkId,
                user.Username,
                user.Email,
                user.FirstName,
                user.LastName,
                user.Role,
                user.Institution,
                user.CreatedAt,
                user.IsBanned
            })
            .ToListAsync();

        return Ok(users);
    }

    // PUT /api/users/{id}/role — Rolle ändern (nur Admin). Erlaubt sind nur die drei bekannten
    // Rollen; Admins dürfen ihre eigene Rolle nicht ändern (um sich nicht versehentlich selbst
    // die Admin-Rechte zu entziehen). Die Rolle wird zusätzlich in Clerk (public_metadata) gespiegelt,
    // damit sie z.B. im JWT/Frontend konsistent verfügbar ist.
    [HttpPut("{id:int}/role")]
    public async Task<IActionResult> UpdateRole(int id, [FromBody] UpdateRoleDto dto)
    {
        var admin = await GetCurrentAdminAsync();
        if (admin == null)
            return Forbid();

        // Whitelist gültiger Rollen (case-insensitive), um beliebige/fehlerhafte Werte abzulehnen
        var allowedRoles = new Dictionary<string, string>(
            StringComparer.OrdinalIgnoreCase)
        {
            ["Nutzer"] = "Nutzer",
            ["Moderator"] = "Moderator",
            ["Admin"] = "Admin"
        };

        if (string.IsNullOrWhiteSpace(dto.Role) ||
            !allowedRoles.TryGetValue(dto.Role.Trim(), out var role))
        {
            return BadRequest("Ungültige Rolle.");
        }

        var targetUser = await _db.Users.FindAsync(id); // variable user zu targetUser ubenannt,
                                                        // für Verständlichkeit
        if (targetUser == null) return NotFound("Benutzer wurde nicht gefunden.");

        if (targetUser.Id == admin.Id)
        {
            return BadRequest(
                "Du kannst deine eigene Rolle nicht ändern.");
        }

        var clerkClient = _httpClientFactory.CreateClient("Clerk");

        var clerkResponse = await clerkClient.PatchAsJsonAsync(
            $"users/{Uri.EscapeDataString(targetUser.ClerkId)}/metadata",
            new
            {
                public_metadata = new
                {
                    role
                }
            });

        if (!clerkResponse.IsSuccessStatusCode)
        {
            return StatusCode(
                StatusCodes.Status502BadGateway,
                "Die Rolle konnte in Clerk nicht aktualisiert werden.");
        }

        targetUser.Role = role;
        await _db.SaveChangesAsync();

        return Ok(new { targetUser.Id, targetUser.Role });
    }

    // POST /api/users/{id}/ban — sperrt einen Nutzer (nur Admin). Admins können sich weder selbst
    // noch andere Admins sperren (ein Admin muss vorher heruntergestuft werden); Sperrung wird
    // zusätzlich bei Clerk durchgeführt, damit der Nutzer sich dort nicht mehr anmelden kann.
    [HttpPost("{id:int}/ban")]
    public async Task<IActionResult> BanUser(int id)
    {
        var admin = await GetCurrentAdminAsync();

        if (admin == null)
            return Forbid();

        var targetUser = await _db.Users.FindAsync(id);

        if (targetUser == null || targetUser.DeletedAt != null)
            return NotFound("Benutzer wurde nicht gefunden.");

        if (targetUser.Id == admin.Id)
            return BadRequest("Du kannst dich nicht selbst sperren.");

        if (targetUser.Role == "Admin")
        {
            return BadRequest(
                "Ein Administrator muss vor dem Sperren heruntergestuft werden.");
        }

        if (targetUser.IsBanned)
            return BadRequest("Der Benutzer ist bereits gesperrt.");

        var clerkClient =
            _httpClientFactory.CreateClient("Clerk");

        var clerkResponse = await clerkClient.PostAsync(
            $"users/{Uri.EscapeDataString(targetUser.ClerkId)}/ban",
            null);

        if (!clerkResponse.IsSuccessStatusCode)
        {
            return StatusCode(
                StatusCodes.Status502BadGateway,
                "Der Benutzer konnte in Clerk nicht gesperrt werden.");
        }

        targetUser.IsBanned = true;
        await _db.SaveChangesAsync();

        return Ok(new
        {
            targetUser.Id,
            targetUser.IsBanned
        });
    }

    // POST /api/users/{id}/unban — hebt die Sperrung eines Nutzers auf (nur Admin), sowohl lokal
    // als auch bei Clerk.
    [HttpPost("{id:int}/unban")]
    public async Task<IActionResult> UnbanUser(int id)
    {
        var admin = await GetCurrentAdminAsync();

        if (admin == null)
            return Forbid();

        var targetUser = await _db.Users.FindAsync(id);

        if (targetUser == null || targetUser.DeletedAt != null)
            return NotFound("Benutzer wurde nicht gefunden.");

        if (!targetUser.IsBanned)
            return BadRequest("Der Benutzer ist nicht gesperrt.");

        var clerkClient =
            _httpClientFactory.CreateClient("Clerk");

        var clerkResponse = await clerkClient.PostAsync(
            $"users/{Uri.EscapeDataString(targetUser.ClerkId)}/unban",
            null);

        if (!clerkResponse.IsSuccessStatusCode)
        {
            return StatusCode(
                StatusCodes.Status502BadGateway,
                "Der Benutzer konnte in Clerk nicht entsperrt werden.");
        }

        targetUser.IsBanned = false;
        await _db.SaveChangesAsync();

        return Ok(new
        {
            targetUser.Id,
            targetUser.IsBanned
        });
    }

    // DELETE /api/users/{id} — Benutzer löschen (nur Admin). Kein Hard-Delete: der Nutzer wird bei
    // Clerk entfernt, lokal aber nur anonymisiert (Soft-Delete), damit verknüpfte Daten (Sammlungen,
    // Funde, Ausleihen usw.) nicht mitgelöscht werden bzw. verwaisen.
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> DeleteUser(int id)
    {

        var admin = await GetCurrentAdminAsync();

        if (admin == null)
            return Forbid();

        var targetUser = await _db.Users.FindAsync(id);
        if (targetUser == null || targetUser.DeletedAt != null)
            return NotFound("Benutzer wurde nicht gefunden.");

        if (targetUser.Id == admin.Id)
            return BadRequest("Du kannst dich nicht selbst löschen.");

        if (targetUser.Role == "Admin")
        {
            return BadRequest(
                "Ein Administrator muss vor dem Löschen heruntergestuft werden.");
        }

        var clerkClient =
            _httpClientFactory.CreateClient("Clerk");

        var clerkResponse = await clerkClient.DeleteAsync(
            $"users/{Uri.EscapeDataString(targetUser.ClerkId)}");

        if (!clerkResponse.IsSuccessStatusCode &&
            clerkResponse.StatusCode != HttpStatusCode.NotFound)
        {
            return StatusCode(
                StatusCodes.Status502BadGateway,
                "Der Benutzer konnte in Clerk nicht gelöscht werden.");
        }

        // zum Löschen vielleich lieber "unechte" Löschung = Daten auf Null setzen.
        // Ansonsten werden alle Einträge - Collections, Funde usw. mitgelöscht

        // Anonymisierung: persönliche Daten werden überschrieben/entfernt, DeletedAt markiert den
        // Account als gelöscht (wird u.a. in GetCurrentAdminAsync/-User-Abfragen berücksichtigt),
        // Rolle wird auf die niedrigste Stufe zurückgesetzt.
        targetUser.IsBanned = true;
        targetUser.DeletedAt = DateTime.UtcNow;
        targetUser.Role = "Nutzer";
        targetUser.Email =
            $"deleted-email-{targetUser.Id}@collectio.invalid";
        targetUser.Username =
            $"deleted-user-{targetUser.Id}";
        targetUser.FirstName = null;
        targetUser.LastName = null;
        targetUser.Institution = null;

        await _db.SaveChangesAsync();

        return Ok(new
        {
            message = "Benutzer wurde gelöscht und anonymmisiert."
        });
    }

    // DELETE /api/users/me — eigenes Konto löschen (Selbstlöschung, für jeden angemeldeten Nutzer).
    // Admins können sich nicht selbst löschen (müssen zuerst von einem anderen Admin heruntergestuft
    // werden), sonst gleiche Anonymisierungslogik wie bei DeleteUser.
    [HttpDelete("me")]
    public async Task<IActionResult> DeleteSelf()
    {
        var clerkId = User.FindFirst("sub")?.Value;
        if (string.IsNullOrWhiteSpace(clerkId)) return Unauthorized();

        var user = await _db.Users.FirstOrDefaultAsync(u => u.ClerkId == clerkId && u.DeletedAt == null);
        if (user == null) return NotFound("Benutzer wurde nicht gefunden.");

        if (user.Role == "Admin")
            return BadRequest("Als Administrator kannst du dein Konto nicht selbst löschen. Bitte wende dich an einen anderen Admin.");

        var clerkClient = _httpClientFactory.CreateClient("Clerk");
        var clerkResponse = await clerkClient.DeleteAsync($"users/{Uri.EscapeDataString(user.ClerkId)}");

        if (!clerkResponse.IsSuccessStatusCode && clerkResponse.StatusCode != HttpStatusCode.NotFound)
            return StatusCode(StatusCodes.Status502BadGateway, "Das Konto konnte bei Clerk nicht gelöscht werden.");

        user.IsBanned = true;
        user.DeletedAt = DateTime.UtcNow;
        user.Role = "Nutzer";
        user.Email = $"deleted-email-{user.Id}@collectio.invalid";
        user.Username = $"deleted-user-{user.Id}";
        user.FirstName = null;
        user.LastName = null;
        user.Institution = null;

        await _db.SaveChangesAsync();
        return Ok(new { message = "Dein Konto wurde gelöscht und anonymisiert." });
    }

    // GET /api/users/stats — Systemstatistiken für Admin-Dashboard
    [HttpGet("stats")]
    public async Task<IActionResult> GetStats()
    {
        var admin = await GetCurrentAdminAsync();

        if (admin == null)
            return Forbid();

        var totalUsers = await _db.Users.CountAsync(user => user.DeletedAt == null);
        var totalObjects = await _db.CollectItems.CountAsync();
        var totalSpecies = await _db.Taxonomies.CountAsync(t => t.Rank == "Art");
        var totalLoans = await _db.Loans.CountAsync();
        var pendingTax = await _db.TaxonomySubmissions.CountAsync(s => s.Status == "pending");

        return Ok(new { totalUsers, totalObjects, totalSpecies, totalLoans, pendingTax });
    }
}

