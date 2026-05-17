using System;
using System.Collections.Generic;

namespace TodoApi.Models;

public partial class Collection
{
    public int Id { get; set; }

    public int? UserId { get; set; }

    public string Name { get; set; } = null!;

    public string? Description { get; set; }

    public bool? IsPublic { get; set; }

    public virtual ICollection<CollectItem> CollectItems { get; set; } = new List<CollectItem>();

    public virtual ICollection<StorageLocation> StorageLocations { get; set; } = new List<StorageLocation>();

    public virtual User? User { get; set; }
}
