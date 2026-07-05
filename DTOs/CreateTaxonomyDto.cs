namespace TodoApi.DTOs;

/// <summary>Request-DTO zum direkten Anlegen eines Taxonomie-Eintrags (z.B. durch Moderatoren/Admins).</summary>
public class CreateTaxonomyDto
{
    public string Name { get; set; } = null!;
    public string? Rank { get; set; }
    public int? ParentId { get; set; }
}
