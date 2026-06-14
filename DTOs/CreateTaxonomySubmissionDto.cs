// für manuelle Taxonomie Einträge der User

namespace TodoApi.DTOs;

public class CreateTaxonomySubmissionDto
{
    public string Stamm { get; set; } = null!;
    public string Klasse { get; set; } = null!;
    public string Ordnung { get; set; } = null!;
    public string Familie { get; set; } = null!;
    public string Gattung { get; set; } = null!;
    public string Art { get; set; } = null!;
}