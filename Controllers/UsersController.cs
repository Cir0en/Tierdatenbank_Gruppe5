using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TodoApi.Models;

namespace TodoApi.Controllers;

[ApiController]
[Route("api/users")]
public class UsersController : ControllerBase
{
    private readonly NeondbContext _db;

    public UsersController(NeondbContext db) => _db = db;

    // GET /api/users — alle Benutzer (nur Admin)
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var users = await _db.Users
            .OrderBy(u => u.CreatedAt)
            .Select(u => new
            {
                u.Id,
                u.ClerkId,
                u.Username,
                u.Email,
                u.FirstName,
                u.LastName,
                u.Role,
                u.Institution,
                u.CreatedAt
            })
            .ToListAsync();

        return Ok(users);
    }

    // PUT /api/users/{id}/role — Rolle ändern (nur Admin)
    [HttpPut("{id:int}/role")]
    public async Task<IActionResult> UpdateRole(int id, [FromBody] UpdateRoleDto dto)
    {
        var allowedRoles = new[] { "Nutzer", "Moderator", "Admin", "Inaktiv" };
        if (!allowedRoles.Contains(dto.Role))
            return BadRequest("Ungültige Rolle.");

        var user = await _db.Users.FindAsync(id);
        if (user == null) return NotFound();

        user.Role = dto.Role;
        await _db.SaveChangesAsync();

        return Ok(new { user.Id, user.Role });
    }

    // DELETE /api/users/{id} — Benutzer löschen (nur Admin)
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var user = await _db.Users.FindAsync(id);
        if (user == null) return NotFound();

        _db.Users.Remove(user);
        await _db.SaveChangesAsync();

        return NoContent();
    }

    // GET /api/users/stats — Systemstatistiken für Admin-Dashboard
    [HttpGet("stats")]
    public async Task<IActionResult> GetStats()
    {
        var totalUsers    = await _db.Users.CountAsync();
        var totalObjects  = await _db.CollectItems.CountAsync();
        var totalSpecies  = await _db.Taxonomies.CountAsync(t => t.Rank == "Art");
        var totalLoans    = await _db.Loans.CountAsync();
        var pendingTax    = await _db.TaxonomySubmissions.CountAsync(s => s.Status == "pending");

        return Ok(new { totalUsers, totalObjects, totalSpecies, totalLoans, pendingTax });
    }
}

public record UpdateRoleDto(string Role);
