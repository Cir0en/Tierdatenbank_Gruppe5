namespace TodoApi.DTOs;

public class CollectionListDto
{
    public int Id { get; set; }
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public bool IsPublic { get; set; }
    public int ItemCount { get; set; }

    public string? OwnerUsername { get; set; }

    // für Rechte
    public bool IsOwner { get; set; }
    public bool CanEdit { get; set; }
    public bool CanDelete { get; set; }
}