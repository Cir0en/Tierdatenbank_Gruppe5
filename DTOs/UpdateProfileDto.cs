namespace TodoApi.DTOs;

/// <summary>Request-DTO, mit dem ein Nutzer sein eigenes Profil (Benutzername/Institution) bearbeitet.</summary>
public record UpdateProfileDto(string Username, string? Institution);
