namespace TodoApi.DTOs;

/// <summary>Request-DTO zum Anlegen einer neuen Sammlung.</summary>
public class CreateCollectionDto
{
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public bool IsPublic { get; set; }
}