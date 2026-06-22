using Microsoft.EntityFrameworkCore;
using TodoApi.Models;

namespace TodoApi.Security;

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

            if (string.IsNullOrWhiteSpace(clerkId))
            {
                context.Response.StatusCode =
                    StatusCodes.Status401Unauthorized;

                return;
            }

            var user = await db.Users.FirstOrDefaultAsync(
                user => user.ClerkId == clerkId);

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