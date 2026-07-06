
using System.Collections.ObjectModel;

namespace Tierapp.DTOs;

public class CollectionDetailDto
{
    public int Id { get; set; }
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public bool IsPublic { get; set; }

    public string? OwnerUsername { get; set; }

    public bool IsOwner { get; set; }
    public bool CanEdit { get; set; }
    public bool CanDelete { get; set; }

    public List<CollectionItemDto> Items { get; set; } = new();
}