using System;
using System.Collections.Generic;

namespace TodoApi.Models;

public partial class Object
{
    public int Id { get; set; }

    public int? CollectionId { get; set; }

    public int? TaxonomyId { get; set; }

    public string? Name { get; set; }

    public DateOnly? FindDate { get; set; }

    public string? Description { get; set; }

    public DateTime? CreatedAt { get; set; }

    public string? StorageInfo { get; set; }

    public int? FindingLocationId { get; set; }

    public int? StorageLocationId { get; set; }

    public virtual Collection? Collection { get; set; }

    public virtual GeoLocation? FindingLocation { get; set; }

    public virtual ICollection<Loan> Loans { get; set; } = new List<Loan>();

    public virtual ICollection<ObjectImage> ObjectImages { get; set; } = new List<ObjectImage>();

    public virtual StorageLocation? StorageLocation { get; set; }

    public virtual Taxonomy? Taxonomy { get; set; }
}
