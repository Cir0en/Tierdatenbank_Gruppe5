using System;
using System.Collections.Generic;

namespace Tierapp.DTOs;

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

    /// <summary>Untergeordnete Standorte in der Hierarchie (Kind-Knoten dieses Standorts).</summary>
    public virtual ICollection<GeoLocation> InverseParent { get; set; } = new List<GeoLocation>();

    public virtual GeoLocation? Parent { get; set; }
}
