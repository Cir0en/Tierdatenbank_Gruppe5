namespace TodoApi.DTOs;

public class CreateCollectionDto
{
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public bool IsPublic { get; set; }
}