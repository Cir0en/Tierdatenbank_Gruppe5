namespace TodoApi.Models;

/// <summary>Erlaubte Werte für <see cref="TaxonomySubmission.Status"/>.</summary>
public static class TaxonomySubmissionStatus
{
    public const string Pending = "pending";
    public const string Approved = "approved";
    public const string Rejected = "rejected";
}

/// <summary>
/// Repräsentiert einen von einem Nutzer eingereichten Vorschlag für einen neuen Taxonomie-Eintrag
/// (Tabelle "taxonomy_submissions"), z.B. weil die Art über die GBIF-Suche nicht gefunden wurde.
/// Muss von einem Moderator/Admin geprüft werden (<see cref="Status"/>, <see cref="ReviewedBy"/>,
/// <see cref="ReviewedAt"/>); bei Genehmigung entsteht daraus i.d.R. ein <see cref="Taxonomy"/>-Eintrag.
/// </summary>
public class TaxonomySubmission
{
    public int Id { get; set; }

    public int? CreatedBy { get; set; }

    // Vollständiger taxonomischer Pfad, den der Nutzer manuell angegeben hat
    // (Reich > Stamm > Klasse > Ordnung > Familie > Gattung > Art).
    public string Reich { get; set; } = "Animalia";
    public string Stamm { get; set; } = null!;
    public string Klasse { get; set; } = null!;
    public string Ordnung { get; set; } = null!;
    public string Familie { get; set; } = null!;
    public string Gattung { get; set; } = null!;
    public string Art { get; set; } = null!;

    /// <summary>Herkunft des Eintrags (z.B. "manual" bei manueller Nutzereingabe vs. GBIF-Import).</summary>
    public string Source { get; set; } = "manual";

    /// <summary>Bearbeitungsstatus des Vorschlags, siehe <see cref="TaxonomySubmissionStatus"/>.</summary>
    public string Status { get; set; } = TaxonomySubmissionStatus.Pending;

    /// <summary>Freitext-Kommentar des Moderators/Admins zur Entscheidung (z.B. Ablehnungsgrund).</summary>
    public string? ModeratorNote { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? ReviewedAt { get; set; }

    /// <summary>Moderator/Admin, der den Vorschlag geprüft (genehmigt/abgelehnt) hat.</summary>
    public int? ReviewedBy { get; set; }
}