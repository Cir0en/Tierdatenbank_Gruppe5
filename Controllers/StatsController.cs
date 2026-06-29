using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TodoApi.Models;

namespace TodoApi.Controllers;

[ApiController]
[Route("api/stats")]
[Authorize]
public class StatsController : ControllerBase
{
    private readonly NeondbContext _db;

    public StatsController(NeondbContext db) => _db = db;

    private async Task<User?> GetModOrAdminAsync()
    {
        var clerkId = User.FindFirst("sub")?.Value;
        if (string.IsNullOrWhiteSpace(clerkId)) return null;
        return await _db.Users.FirstOrDefaultAsync(u =>
            u.ClerkId == clerkId &&
            (u.Role == "Moderator" || u.Role == "Admin") &&
            !u.IsBanned &&
            u.DeletedAt == null);
    }

    [HttpGet("moderator")]
    public async Task<IActionResult> GetModeratorStats()
    {
        if (await GetModOrAdminAsync() == null) return Forbid();

        var now = DateTime.UtcNow;
        var startOfMonth = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var today = DateOnly.FromDateTime(now);

        // Taxonomy submissions
        var taxPending  = await _db.TaxonomySubmissions.CountAsync(s => s.Status == "pending");
        var taxApproved = await _db.TaxonomySubmissions.CountAsync(s => s.Status == "approved");
        var taxRejected = await _db.TaxonomySubmissions.CountAsync(s => s.Status == "rejected");
        var taxThisMonth = await _db.TaxonomySubmissions
            .CountAsync(s => s.Status != "pending" && s.ReviewedAt >= startOfMonth);

        // Collection items
        var colTotal       = await _db.CollectItems.CountAsync();
        var colFreigegeben = await _db.CollectItems.CountAsync(c => c.Status == "freigegeben");
        var colAusstehend  = await _db.CollectItems.CountAsync(c => c.Status == "ausstehend");
        var colAbgelehnt   = await _db.CollectItems.CountAsync(c => c.Status == "abgelehnt");

        // Loans
        var loansTotal   = await _db.Loans.CountAsync();
        var loansActive  = await _db.Loans.CountAsync(l => l.Status == "aktiv");
        var loansOverdue = await _db.Loans.CountAsync(l => l.EndDate < today && l.Status == "aktiv");

        // Taxonomies
        var taxTotal    = await _db.Taxonomies.CountAsync(t => t.IsApproved == true);
        var taxSpecies  = await _db.Taxonomies.CountAsync(t => t.Rank == "Art" && t.IsApproved == true);

        // Recent decisions (last 8)
        var recent = await _db.TaxonomySubmissions
            .Where(s => s.Status != "pending")
            .OrderByDescending(s => s.ReviewedAt)
            .Take(8)
            .Select(s => new
            {
                s.Id,
                s.Art,
                s.Gattung,
                s.Status,
                s.ModeratorNote,
                s.ReviewedAt
            })
            .ToListAsync();

        return Ok(new
        {
            taxonomy = new { taxPending, taxApproved, taxRejected, taxThisMonth },
            collection = new { colTotal, colFreigegeben, colAusstehend, colAbgelehnt },
            loans = new { loansTotal, loansActive, loansOverdue },
            overview = new { taxTotal, taxSpecies },
            recentDecisions = recent
        });
    }

    [HttpGet("moderator/users")]
    public async Task<IActionResult> GetUserActivity()
    {
        if (await GetModOrAdminAsync() == null) return Forbid();

        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var users = await _db.Users
            .Where(u => u.DeletedAt == null)
            .OrderBy(u => u.CreatedAt)
            .Select(u => new
            {
                u.Id,
                u.Username,
                u.FirstName,
                u.LastName,
                u.Email,
                u.Role,
                u.CreatedAt,
                TaxPending  = _db.TaxonomySubmissions.Count(s => s.CreatedBy == u.Id && s.Status == "pending"),
                TaxApproved = _db.TaxonomySubmissions.Count(s => s.CreatedBy == u.Id && s.Status == "approved"),
                TaxRejected = _db.TaxonomySubmissions.Count(s => s.CreatedBy == u.Id && s.Status == "rejected"),
                LoansActive  = _db.Loans.Count(l => l.BorrowerId == u.Id && l.Status == "aktiv"),
                LoansOverdue = _db.Loans.Count(l => l.BorrowerId == u.Id && l.Status == "aktiv" && l.EndDate < today),
                LastSubmission = _db.TaxonomySubmissions
                    .Where(s => s.CreatedBy == u.Id)
                    .OrderByDescending(s => s.CreatedAt)
                    .Select(s => (DateTime?)s.CreatedAt)
                    .FirstOrDefault()
            })
            .ToListAsync();

        return Ok(users);
    }
}
