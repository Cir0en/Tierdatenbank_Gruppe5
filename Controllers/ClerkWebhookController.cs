using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Svix;
using TodoApi.Models;

namespace TodoApi.Controllers;

/// <summary>
/// Empfängt Webhook-Events von Clerk (Auth-Provider) und synchronisiert Nutzerdaten in die lokale
/// Neon-Datenbank. Kein [Authorize] nötig/möglich, da Clerk selbst der Aufrufer ist — die Absicherung
/// erfolgt stattdessen über die Svix-Signaturprüfung (Webhook-Secret) in <see cref="Handle"/>.
/// </summary>
[ApiController]
[Route("api/clerk/webhook")]
public class ClerkWebhookController : ControllerBase
{
    private readonly NeondbContext _db;
    private readonly IConfiguration _config;

    public ClerkWebhookController(NeondbContext db, IConfiguration config)
    {
        _db = db;
        _config = config;
    }

    /// <summary>
    /// Verarbeitet eingehende Clerk-Webhook-Events (POST /api/clerk/webhook).
    /// Verifiziert zunächst die Svix-Signatur, um sicherzustellen, dass die Anfrage
    /// tatsächlich von Clerk stammt. Reagiert nur auf "user.created" und "user.updated"
    /// und legt den Nutzer lokal an bzw. aktualisiert ihn (Upsert nach ClerkId).
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> Handle()
    {
        using var reader = new StreamReader(Request.Body);
        var payload = await reader.ReadToEndAsync();

        var secret = _config["Clerk:WebhookSecret"];

        if (string.IsNullOrWhiteSpace(secret))
            return StatusCode(500, "Missing Clerk webhook secret.");

        var headers = new WebHeaderCollection
        {
            { "svix-id", Request.Headers["svix-id"].ToString() },
            { "svix-timestamp", Request.Headers["svix-timestamp"].ToString() },
            { "svix-signature", Request.Headers["svix-signature"].ToString() }
        };

        try
        {
            // Signaturprüfung via Svix-Bibliothek: verhindert, dass gefälschte Requests
            // (ohne gültiges Webhook-Secret) Nutzerdaten in der DB verändern können
            var webhook = new Webhook(secret);
            webhook.Verify(payload, headers);
        }
        catch
        {
            return Unauthorized("Invalid webhook signature.");
        }

        using var json = JsonDocument.Parse(payload);
        var root = json.RootElement;

        var eventType = root.GetProperty("type").GetString();

        // Nur Nutzer-Erstellung/-Änderung wird verarbeitet, alle anderen Clerk-Events werden ignoriert
        if (eventType != "user.created" && eventType != "user.updated")
            return Ok();

        var data = root.GetProperty("data");
        var clerkId = data.GetProperty("id").GetString();

        var primaryEmailId = data.TryGetProperty("primary_email_address_id", out var primaryEmailElement)
            ? primaryEmailElement.GetString()
            : null;

        string? email = null;

        // Clerk-Nutzer können mehrere E-Mail-Adressen haben; wir übernehmen die als "primary"
        // markierte Adresse. Falls keine als primär gefunden wird, dient die erste als Fallback.
        foreach (var emailAddress in data.GetProperty("email_addresses").EnumerateArray())
        {
            var id = emailAddress.GetProperty("id").GetString();

            if (id == primaryEmailId || email == null)
            {
                email = emailAddress.GetProperty("email_address").GetString();
            }
        }

        string? username = null;

        if (data.TryGetProperty("username", out var usernameElement) &&
            usernameElement.ValueKind != JsonValueKind.Null)
        {
            username = usernameElement.GetString();
        }

        if (string.IsNullOrWhiteSpace(username))
            username = email?.Split('@')[0];

        if (string.IsNullOrWhiteSpace(clerkId) || string.IsNullOrWhiteSpace(email))
            return BadRequest("Missing Clerk user data.");

        string? firstName = null;

        if (data.TryGetProperty("first_name", out var firstNameElement) &&
            firstNameElement.ValueKind != JsonValueKind.Null)
        {
            firstName = firstNameElement.GetString();
        }

        string? lastName = null;

        if (data.TryGetProperty("last_name", out var lastNameElement) &&
            lastNameElement.ValueKind != JsonValueKind.Null)
        {
            lastName = lastNameElement.GetString();
        }

        // Upsert: existiert der Nutzer (per ClerkId) bereits, wird er aktualisiert,
        // ansonsten neu angelegt (deckt sowohl "user.created" als auch "user.updated" ab)
        var user = await _db.Users.FirstOrDefaultAsync(u => u.ClerkId == clerkId);

        if (user == null)
        {
            user = new User
            {
                ClerkId = clerkId,
                Email = email,
                Username = username ?? clerkId,
                FirstName = firstName,
                LastName = lastName,
                Role = "Nutzer" // Standardrolle für neu registrierte Nutzer
                // CreatedAt - wird von Neon bereitgestellt
            };

            _db.Users.Add(user);
        }
        else
        {
            user.Email = email;
            user.Username = username ?? user.Username;

            if (!string.IsNullOrWhiteSpace(firstName))
                user.FirstName = firstName;

            if (!string.IsNullOrWhiteSpace(lastName))
                user.LastName = lastName;
        }

        await _db.SaveChangesAsync();

        return Ok();
    }
}