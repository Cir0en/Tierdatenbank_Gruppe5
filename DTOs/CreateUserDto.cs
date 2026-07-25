namespace TodoApi.DTOs;

/// <summary>Request-DTO, mit dem ein Moderator/Admin ein neues Nutzerkonto anlegt. Das Konto wird
/// zunächst bei Clerk erstellt (E-Mail + Passwort sind Pflicht) und anschließend lokal in der
/// "users"-Tabelle mit der Rolle "Nutzer" gespiegelt.</summary>
public class CreateUserDto
{
    public string Email { get; set; } = null!;
    public string Password { get; set; } = null!;
    public string? Username { get; set; }
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
}
