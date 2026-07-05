namespace TodoApi.DTOs;

/// <summary>Request-DTO für die Suche nach einer Art im externen GBIF-Artenkatalog anhand ihres Namens.</summary>
public class GbifLookupDto
{
    public string SpeciesName { get; set; } = null!;
}