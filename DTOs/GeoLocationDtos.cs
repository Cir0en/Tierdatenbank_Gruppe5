namespace TodoApi.DTOs;

public class GeoLocationDto
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

public class CreateGeoLocationDto
{
    public int? ParentId { get; set; }
    public string? ExternalId { get; set; }
    public string Name { get; set; } = null!;
    public decimal? Latitude { get; set; }
    public decimal? Longitude { get; set; }
    public string? Type { get; set; }
}

public class GeoMapItemDto
{
    public int ItemId { get; set; }
    public string? ItemName { get; set; }

    public int LocationId { get; set; }
    public string LocationName { get; set; } = null!;

    public decimal Latitude { get; set; }
    public decimal Longitude { get; set; }

    public int? CollectionId { get; set; }
    public string? CollectionName { get; set; }

    public int? TaxonomyId { get; set; }
    public string? TaxonomyName { get; set; }

    public string? Status { get; set; }
}