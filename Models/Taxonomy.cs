using System;
using System.Collections.Generic;

namespace TodoApi.Models;

/// <summary>
/// Repräsentiert einen taxonomischen Knoten (Tabelle "taxonomy"), z.B. Reich, Stamm, Klasse,
/// Ordnung, Familie, Gattung oder Art (<see cref="Rank"/>), organisiert als Baum über
/// <see cref="ParentId"/>/<see cref="Parent"/> und <see cref="InverseParent"/> (Kind-Knoten).
/// Kann von Nutzern manuell angelegt worden sein (<see cref="CreatedByNavigation"/>) und muss
/// dann ggf. erst freigegeben werden (<see cref="IsApproved"/>), z.B. via GBIF-Abgleich.
/// </summary>
public partial class Taxonomy
{
    public int Id { get; set; }

    public int? ParentId { get; set; }

    /// <summary>Nutzer, der diesen Taxonomie-Eintrag manuell angelegt hat (null bei Systemdaten).</summary>
    public int? CreatedBy { get; set; }

    public string Name { get; set; } = null!;

    /// <summary>Taxonomische Rangstufe (z.B. "Art", "Gattung", "Familie"); freier String.</summary>
    public string? Rank { get; set; }

    /// <summary>Ob der Eintrag von einem Moderator/Admin freigegeben wurde; Default in der DB ist false.</summary>
    public bool? IsApproved { get; set; }

    public virtual ICollection<CollectItem> CollectItems { get; set; } = new List<CollectItem>();

    public virtual User? CreatedByNavigation { get; set; }

    /// <summary>Untergeordnete Taxonomie-Knoten in der Hierarchie (Kind-Knoten dieses Knotens).</summary>
    public virtual ICollection<Taxonomy> InverseParent { get; set; } = new List<Taxonomy>();

    public virtual Taxonomy? Parent { get; set; }
}
