namespace TodoApi.Models;

public static class TaxonomySubmissionStatus
{
    public const string Pending = "pending";
    public const string Approved = "approved";
    public const string Rejected = "rejected";
}

public class TaxonomySubmission
{
    public int Id { get; set; }

    public int? CreatedBy { get; set; }

    public string Reich { get; set; } = "Animalia";
    public string Stamm { get; set; } = null!;
    public string Klasse { get; set; } = null!;
    public string Ordnung { get; set; } = null!;
    public string Familie { get; set; } = null!;
    public string Gattung { get; set; } = null!;
    public string Art { get; set; } = null!;

    public string Source { get; set; } = "manual";

    public string Status { get; set; } = TaxonomySubmissionStatus.Pending;

    public string? ModeratorNote { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? ReviewedAt { get; set; }

    public int? ReviewedBy { get; set; }
}