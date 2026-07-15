using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using TodoApi.Models;

namespace TodoApi.Services;

/// <summary>
/// Fallback für den Fall, dass ein Nutzer bei Clerk existiert, aber (noch) nicht lokal in der
/// "users"-Tabelle steht — normalerweise übernimmt das der Webhook in
/// <see cref="TodoApi.Controllers.ClerkWebhookController"/>, der aber z.B. bei falsch konfiguriertem
/// Webhook-Ziel (lokale Entwicklung ohne erreichbaren Tunnel) nie ankommt. Holt die Nutzerdaten in
/// diesem Fall direkt über die Clerk-Management-API nach und legt den Nutzer lokal an.
/// </summary>
public class ClerkUserProvisioningService
{
    private readonly NeondbContext _db;
    private readonly IHttpClientFactory _httpClientFactory;

    public ClerkUserProvisioningService(NeondbContext db, IHttpClientFactory httpClientFactory)
    {
        _db = db;
        _httpClientFactory = httpClientFactory;
    }

    public async Task<User?> ProvisionFromClerkAsync(string clerkId)
    {
        var client = _httpClientFactory.CreateClient("Clerk");
        var response = await client.GetAsync($"users/{Uri.EscapeDataString(clerkId)}");
        if (!response.IsSuccessStatusCode)
            return null;

        using var json = JsonDocument.Parse(await response.Content.ReadAsStreamAsync());
        var root = json.RootElement;

        var primaryEmailId = root.TryGetProperty("primary_email_address_id", out var primaryEmailElement)
            ? primaryEmailElement.GetString()
            : null;

        string? email = null;
        if (root.TryGetProperty("email_addresses", out var emailAddresses))
        {
            foreach (var emailAddress in emailAddresses.EnumerateArray())
            {
                var id = emailAddress.GetProperty("id").GetString();
                if (id == primaryEmailId || email == null)
                    email = emailAddress.GetProperty("email_address").GetString();
            }
        }

        if (string.IsNullOrWhiteSpace(email))
            return null;

        string? username = root.TryGetProperty("username", out var usernameElement) &&
            usernameElement.ValueKind != JsonValueKind.Null
                ? usernameElement.GetString()
                : null;
        if (string.IsNullOrWhiteSpace(username))
            username = email.Split('@')[0];

        string? firstName = root.TryGetProperty("first_name", out var firstNameElement) &&
            firstNameElement.ValueKind != JsonValueKind.Null
                ? firstNameElement.GetString()
                : null;

        string? lastName = root.TryGetProperty("last_name", out var lastNameElement) &&
            lastNameElement.ValueKind != JsonValueKind.Null
                ? lastNameElement.GetString()
                : null;

        // Zwischen dem ursprünglichen Lookup und hier könnte der Webhook den Nutzer inzwischen
        // selbst angelegt haben (Race Condition) — dann diesen verwenden statt einen zweiten anzulegen.
        var existing = await _db.Users.FirstOrDefaultAsync(u => u.ClerkId == clerkId);
        if (existing != null)
            return existing;

        var user = new User
        {
            ClerkId = clerkId,
            Email = email,
            Username = username ?? clerkId,
            FirstName = firstName,
            LastName = lastName,
            Role = "Nutzer",
        };

        _db.Users.Add(user);

        try
        {
            await _db.SaveChangesAsync();
            return user;
        }
        catch (DbUpdateException ex) when (IsUniqueViolation(ex))
        {
            // Race Condition: ein paralleler Request (oder der Webhook) hat den Nutzer zwischen dem
            // Lookup oben und diesem SaveChangesAsync bereits angelegt. War es derselbe ClerkId,
            // einfach den existierenden Nutzer verwenden; war es nur eine Username-Kollision mit
            // einem anderen Nutzer, den Username mit einem eindeutigen Suffix erneut versuchen.
            var concurrent = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.ClerkId == clerkId);
            if (concurrent != null)
            {
                _db.Entry(user).State = EntityState.Detached;
                return concurrent;
            }

            user.Username = $"{user.Username}-{clerkId[^Math.Min(6, clerkId.Length)..]}";
            await _db.SaveChangesAsync();
            return user;
        }
    }

    private static bool IsUniqueViolation(DbUpdateException ex) =>
        ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation };
}
