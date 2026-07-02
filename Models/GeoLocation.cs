using System;
using System.Collections.Generic;

namespace TodoApi.Models;

/// <summary>
/// Repräsentiert einen geografischen Fundort (Tabelle "geo_locations") in einer hierarchischen
/// Struktur (z.B. Kontinent -> Land -> Region), abgebildet über <see cref="ParentId"/>/<see cref="Parent"/>
/// und <see cref="InverseParent"/> (Kind-Knoten). <see cref="CollectItems"/> sind alle Objekte, deren
/// Fundort dieser Standort ist.
/// </summary>
public partial class GeoLocation
{
    public int Id { get; set; }

    public int? ParentId { get; set; }

    /// <summary>Eindeutige externe Kennung (z.B. aus einer Geo-Datenquelle); DB-seitig unique.</summary>
    public string? ExternalId { get; set; }

    public string Name { get; set; } = null!;

    public decimal? Latitude { get; set; }

    public decimal? Longitude { get; set; }

    /// <summary>Art des Ortes (z.B. "Kontinent", "Land", "Region"); freier String, keine DB-Enum.</summary>
    public string? Type { get; set; }

    public virtual ICollection<CollectItem> CollectItems { get; set; } = new List<CollectItem>();

    /// <summary>Untergeordnete Standorte in der Hierarchie (Kind-Knoten dieses Standorts).</summary>
    public virtual ICollection<GeoLocation> InverseParent { get; set; } = new List<GeoLocation>();

    public virtual GeoLocation? Parent { get; set; }
}
