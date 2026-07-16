namespace TodoApi.DTOs;

/// <summary>Response-DTO für einen Fundort inkl. Zusatzinfos (ob er Kind-Knoten hat, Anzahl zugeordneter Objekte).</summary>
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

/// <summary>Request-DTO zum Anlegen eines neuen Fundorts.</summary>
public class CreateGeoLocationDto
{
    public int? ParentId { get; set; }
    public string? ExternalId { get; set; }
    public string Name { get; set; } = null!;
    public decimal? Latitude { get; set; }
    public decimal? Longitude { get; set; }
    public string? Type { get; set; }
}

/// <summary>Response-DTO für einen einzelnen Marker auf der Karten-Ansicht (Objekt + Fundort + zugehörige Sammlung/Taxonomie).</summary>
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

    public string? Sex { get; set; }
    public string? AgeClass { get; set; }
    public decimal? BodyMassGram { get; set; }
    public decimal? BodyLengthMm { get; set; }

    /// <summary>True, wenn der aktuelle Nutzer dieses Objekt löschen darf (Admin/Moderator oder Ersteller).</summary>
    public bool CanDelete { get; set; }
}