using System;
using System.Collections.Generic;

namespace TodoApi.Models;

public partial class StorageLocation
{
    public int Id { get; set; }

    public int? ParentId { get; set; }

    public int? CollectionId { get; set; }

    public string Name { get; set; } = null!;

    public string? Description { get; set; }

    public virtual Collection? Collection { get; set; }

    public virtual ICollection<StorageLocation> InverseParent { get; set; } = new List<StorageLocation>();

    public virtual ICollection<Object> Objects { get; set; } = new List<Object>();

    public virtual StorageLocation? Parent { get; set; }
}
