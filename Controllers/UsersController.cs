using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TodoApi.Models;
using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Authorization;
using TodoApi.DTOs;

namespace TodoApi.Controllers;

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

    // PUT /api/users/{id}/role — Rolle ändern (nur Admin)
    [HttpPut("{id:int}/role")]
    public async Task<IActionResult> UpdateRole(int id, [FromBody] UpdateRoleDto dto)
    {
        var admin = await GetCurrentAdminAsync();
        if (admin == null)
            return Forbid();

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

    // POST /api/users/{id}/ban
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

    // POST /api/users/{id}/unban
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

    // DELETE /api/users/{id} — Benutzer löschen (nur Admin)
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

