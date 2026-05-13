using System;
using System.Collections.Generic;

namespace TodoApi.Models;

public partial class Taxonomy
{
    public int Id { get; set; }

    public int? ParentId { get; set; }

    public string Name { get; set; } = null!;

    public string? Rank { get; set; }

    public bool? IsApproved { get; set; }

    public virtual ICollection<Taxonomy> InverseParent { get; set; } = new List<Taxonomy>();

    public virtual ICollection<Object> Objects { get; set; } = new List<Object>();

    public virtual Taxonomy? Parent { get; set; }
}
