namespace TodoApi.DTOs;

/// <summary>Request-DTO zum Aktualisieren einer bestehenden Sammlung.</summary>
public class UpdateCollectionDto
{
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public bool IsPublic { get; set; }
}