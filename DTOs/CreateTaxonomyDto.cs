namespace TodoApi.DTOs;

public class CreateTaxonomyDto
{
    public string Name { get; set; } = null!;
    public string? Rank { get; set; }
    public int? ParentId { get; set; }
}
