namespace TodoApi.DTOs;


public class CreateMapAnimalDto
{
    public string SpeciesName { get; set; } = null!;
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
}