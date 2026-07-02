using System;
using System.Collections.Generic;

namespace TodoApi.Models;

/// <summary>
/// Repräsentiert eine Sammlung (Tabelle "collections"), also eine benannte Gruppierung von
/// <see cref="CollectItem"/>s, die einem <see cref="User"/> gehört. Sammlungen können öffentlich
/// oder privat sein (<see cref="IsPublic"/>).
/// </summary>
public partial class Collection
{
    public int Id { get; set; }

    public int? UserId { get; set; }

    public string Name { get; set; } = null!;

    public string? Description { get; set; }

    /// <summary>Steuert, ob die Sammlung für andere Nutzer sichtbar ist (Standard: false/privat).</summary>
    public bool? IsPublic { get; set; }

    public virtual ICollection<CollectItem> CollectItems { get; set; } = new List<CollectItem>();

    public virtual User? User { get; set; }
}
