namespace TodoApi.DTOs;

/// <summary>Request-DTO, mit dem ein Admin die Rolle eines Nutzers ändert (z.B. zu "Moderator"/"Admin").</summary>
public record UpdateRoleDto(string Role);