namespace TodoApi.DTOs;

/// <summary>Request-DTO zum Bearbeiten eines bestehenden Fundobjekts (Stammdaten + Taxonomie).
/// Koordinaten sind optional: werden beide (Latitude/Longitude) mitgeschickt, wird der Fundort
/// aktualisiert bzw. neu zugeordnet; werden beide weggelassen, verliert das Objekt seinen Fundort
/// (verschwindet damit von der Kartenansicht).</summary>
public class UpdateAnimalDto
{
    public string Name { get; set; } = null!;
    public string? Sex { get; set; }
    public string? AgeClass { get; set; }
    public decimal? BodyMassGram { get; set; }
    public decimal? BodyLengthMm { get; set; }

    public decimal? Latitude { get; set; }
    public decimal? Longitude { get; set; }
    public string? LocationName { get; set; }

    public int? TaxonomyId { get; set; }
    public DateOnly? FindDate { get; set; }

    public string? Description { get; set; }
    public string? Status { get; set; }
    public string? Lebensraum { get; set; }
    public string? StorageInfo { get; set; }
}
