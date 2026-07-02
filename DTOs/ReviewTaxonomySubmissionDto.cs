// für Review seitens Moderatoren

namespace TodoApi.DTOs;

/// <summary>Request-DTO, mit dem ein Moderator/Admin einen Taxonomie-Vorschlag genehmigt oder ablehnt (optional mit Kommentar).</summary>
public class ReviewTaxonomySubmissionDto
{
    public string? ModeratorNote { get; set; }
}