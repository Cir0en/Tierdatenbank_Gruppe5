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

    /// <summary>Id des ältesten hochgeladenen Bildes (für /api/images/{id}/content); null wenn kein Bild vorhanden.</summary>
    public int? ImageId { get; set; }
    public string? ImageUrl { get; set; }
    public DateTime? ImageCreatedAt { get; set; }

    /// <summary>True, wenn das Bild als Byte-Array in der DB liegt (ObjectImage.ImageData) statt nur als ImageUrl referenziert zu sein.</summary>
    public bool ImageStoredInDatabase { get; set; }
    public string? Description { get; set; }
    public string? Sex { get; set; }
    public string? AgeClass { get; set; }
    public decimal? BodyMassGram { get; set; }
    public decimal? BodyLengthMm { get; set; }

    /// <summary>True, wenn aktuell eine offene Ausleihe für dieses Objekt existiert.</summary>
    public bool IsOnLoan { get; set; }

    /// <summary>Name des aktuellen Entleihers; nur für Eigentümer/Moderation gefüllt, sonst null.</summary>
    public string? LoanedToUsername { get; set; }

    /// <summary>Vereinbartes Rückgabedatum der offenen Ausleihe; nur für Eigentümer/Moderation gefüllt, sonst null.</summary>
    public DateOnly? LoanReturnDate { get; set; }

    /// <summary>True, wenn der aktuelle Nutzer dieses Tier löschen darf (Admin/Moderator oder Ersteller).</summary>
    public bool CanDelete { get; set; }
}
