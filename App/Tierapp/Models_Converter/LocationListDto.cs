namespace Tierapp.DTOs;

public class LocationListDto
{
    public int Id { get; set; }
    public int? ParentId { get; set; }
    public string? ExternalId { get; set; }
    public string Name { get; set; } = null!;
    public decimal? Latitude { get; set; }
    public decimal? Longitude { get; set; }
    public string? Type { get; set; }
    public bool HasChildren { get; set; }
    public int ItemCount { get; set; }
}
