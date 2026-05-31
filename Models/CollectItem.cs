using System;
using System.Collections.Generic;

namespace TodoApi.Models;

public partial class CollectItem
{
    public int Id { get; set; }

    public int? CollectionId { get; set; }

    public int? TaxonomyId { get; set; }

    public int? FindingLocationId { get; set; }

    public string? SpeciesName { get; set; }

    public DateOnly? FindDate { get; set; }

    public string? Description { get; set; }

    public string? StorageInfo { get; set; }

    public DateTime? CreatedAt { get; set; }

    public string? Status { get; set; }

    public string? Sex { get; set; }

    public string? AgeClass { get; set; }

    public decimal? BodyMassGram { get; set; }

    public decimal? BodyLengthMm { get; set; }

    public virtual Collection? Collection { get; set; }

    public virtual GeoLocation? FindingLocation { get; set; }

    public virtual ICollection<Loan> Loans { get; set; } = new List<Loan>();

    public virtual ICollection<ObjectImage> ObjectImages { get; set; } = new List<ObjectImage>();

    public virtual Taxonomy? Taxonomy { get; set; }
}
