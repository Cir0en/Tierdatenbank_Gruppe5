namespace Tierapp.DTOs;

public class GeoMapItemDto
{
    public int ItemId { get; set; }
    public string? ItemName { get; set; }

    public int LocationId { get; set; }
    public string LocationName { get; set; } = "";

    public decimal Latitude { get; set; }
    public decimal Longitude { get; set; }

    public int? CollectionId { get; set; }
    public string? CollectionName { get; set; }

    public int? TaxonomyId { get; set; }
    public string? TaxonomyName { get; set; }

    public string? Status { get; set; }
    public string? Sex { get; set; }
    public string? AgeClass { get; set; }

}