namespace TodoApi.DTOs;

/// <summary>Response-DTO für ein einzelnes Objekt/Tier innerhalb einer Sammlungsübersicht (verdichtete Sicht auf CollectItem).</summary>
public class CollectionItemDto
{
    public int Id { get; set; }
    public string? Name { get; set; }
    public DateOnly? FindDate { get; set; }
    public string? Status { get; set; }
    public string? TaxonomyName { get; set; }
    public string? TaxonomyRank { get; set; }
    public string? FindingLocation { get; set; }
    public string? Kategorie { get; set; }
    public string? Lebensraum { get; set; }
    public string? ImageUrl { get; set; }
    public string? Description { get; set; }
    public string? Sex { get; set; }
    public string? AgeClass { get; set; }
    public decimal? BodyMassGram { get; set; }
    public decimal? BodyLengthMm { get; set; }
}
