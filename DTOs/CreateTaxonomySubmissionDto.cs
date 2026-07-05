// für manuelle Taxonomie Einträge der User

namespace TodoApi.DTOs;

/// <summary>Request-DTO, mit dem ein Nutzer einen manuellen Taxonomie-Vorschlag (TaxonomySubmission) zur Prüfung einreicht.</summary>
public class CreateTaxonomySubmissionDto
{
    public string Stamm { get; set; } = null!;
    public string Klasse { get; set; } = null!;
    public string Ordnung { get; set; } = null!;
    public string Familie { get; set; } = null!;
    public string Gattung { get; set; } = null!;
    public string Art { get; set; } = null!;
}