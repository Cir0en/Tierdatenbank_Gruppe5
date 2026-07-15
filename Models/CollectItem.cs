using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations.Schema;

namespace TodoApi.Models;

/// <summary>
/// Repräsentiert ein einzelnes gesammeltes Objekt/Tier (Tabelle "collect_items") – das zentrale
/// fachliche Kernstück der Anwendung. Ein CollectItem gehört optional zu einer <see cref="Collection"/>,
/// ist optional einer <see cref="Taxonomy"/> (Art/Gattung/...) und einem <see cref="GeoLocation"/>
/// (Fundort) zugeordnet und kann mehrere <see cref="ObjectImage"/>s sowie <see cref="Loan"/>-Vorgänge
/// (Ausleihen) besitzen.
/// </summary>
public partial class CollectItem
{
    public int Id { get; set; }

    public int? CollectionId { get; set; }

    public int? TaxonomyId { get; set; }

    public int? FindingLocationId { get; set; }

    public string? Name { get; set; }

    public DateOnly? FindDate { get; set; }

    public string? Description { get; set; }

    /// <summary>Freitext zur physischen Lagerung/Aufbewahrung des Objekts (z.B. Vitrine, Schrank-Nr.).</summary>
    public string? StorageInfo { get; set; }

    public DateTime? CreatedAt { get; set; }

    /// <summary>Fachlicher Status des Objekts (z.B. "verfügbar"/"verliehen"); freier String, keine DB-Enum.</summary>
    public string? Status { get; set; }

    /// <summary>Geschlecht des Tieres, falls bekannt (freier String, z.B. "männlich"/"weiblich").</summary>
    public string? Sex { get; set; }

    /// <summary>Altersklasse des Tieres, falls bekannt (freier String, z.B. "adult"/"juvenil").</summary>
    public string? AgeClass { get; set; }

    // Kategorie + Lebensraum: [NotMapped], da die zugehörigen DB-Spalten noch nicht per ALTER TABLE
    // angelegt wurden. Werte werden aktuell nicht persistiert, nur zur Laufzeit gehalten.
    [NotMapped] public string? Kategorie { get; set; }

    [NotMapped] public string? Lebensraum { get; set; }

    public decimal? BodyMassGram { get; set; }

    public decimal? BodyLengthMm { get; set; }

    /// <summary>Nutzer, der diesen Eintrag angelegt hat (falls beim Anlegen identifizierbar); Basis für die Lösch-Berechtigung.</summary>
    public int? CreatedByUserId { get; set; }

    public virtual Collection? Collection { get; set; }

    public virtual GeoLocation? FindingLocation { get; set; }

    public virtual ICollection<Loan> Loans { get; set; } = new List<Loan>();

    public virtual ICollection<ObjectImage> ObjectImages { get; set; } = new List<ObjectImage>();

    public virtual Taxonomy? Taxonomy { get; set; }

    public virtual User? CreatedByUser { get; set; }
}
