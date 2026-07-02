using Microsoft.EntityFrameworkCore;
using TodoApi.Models;

namespace TodoApi.Security;

/// <summary>
/// Middleware, die nach der JWT-Authentifizierung (siehe Program.cs, muss nach UseAuthentication()
/// und vor UseAuthorization() eingebunden sein) prüft, ob der anhand des Clerk-"sub"-Claims
/// identifizierte Nutzer gebannt (<see cref="Models.User.IsBanned"/>) oder soft-gelöscht
/// (<see cref="Models.User.DeletedAt"/>) ist. Greift ausschließlich bei bereits authentifizierten
/// Requests - anonyme/nicht angemeldete Requests werden unverändert an die Pipeline weitergereicht,
/// die eigentliche Zugriffskontrolle übernimmt weiterhin die nachfolgende Authorization.
/// </summary>
public class UserStatusMiddleware
{
    private readonly RequestDelegate _next;

    public UserStatusMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(
        HttpContext context,
        NeondbContext db)
    {
        if (context.User.Identity?.IsAuthenticated == true)
        {
            var clerkId =
                context.User.FindFirst("sub")?.Value;

            // Sollte durch NameClaimType = "sub" in Program.cs eigentlich immer gesetzt sein;
            // fehlt der Claim dennoch, wird der Request sicherheitshalber abgelehnt.
            if (string.IsNullOrWhiteSpace(clerkId))
            {
                context.Response.StatusCode =
                    StatusCodes.Status401Unauthorized;

                return;
            }

            var user = await db.Users.FirstOrDefaultAsync(
                user => user.ClerkId == clerkId);

            // Kein passender User-Datensatz, oder der Nutzer wurde gebannt bzw. soft-gelöscht:
            // Request wird hier abgebrochen, bevor er den eigentlichen Controller erreicht.
            if (user == null ||
                user.IsBanned ||
                user.DeletedAt != null)
            {
                context.Response.StatusCode =
                    StatusCodes.Status403Forbidden;

                await context.Response.WriteAsync(
                    "Dieses Benutzerkonto ist gesperrt oder gelöscht.");

                return;
            }
        }

        await _next(context);
    }
}