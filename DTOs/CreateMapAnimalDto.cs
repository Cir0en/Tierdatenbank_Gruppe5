namespace TodoApi.DTOs;

/// <summary>Request-DTO zum Anlegen eines neuen Objekts/Tieres direkt über die Karten-Ansicht, inkl. Koordinaten und Fundort.</summary>
public class CreateMapAnimalDto
{
    public string Name { get; set; } = null!;
    public string? Sex { get; set; }
    public string? AgeClass { get; set; }
    public decimal? BodyMassGram { get; set; }
    public decimal? BodyLengthMm { get; set; }

    public decimal Latitude { get; set; }
    public decimal Longitude { get; set; }

    public int? CollectionId { get; set; }
    public int? TaxonomyId { get; set; }
    public DateOnly? FindDate { get; set; }
    public string? LocationName { get; set; }

    public string? Description { get; set; }
    public string? Status { get; set; }
    public string? Lebensraum { get; set; }
}