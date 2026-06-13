namespace TodoApi.DTOs;

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
}
