namespace TodoApi.DTOs;

public class UpdateCollectionDto
{
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public bool IsPublic { get; set; }
}