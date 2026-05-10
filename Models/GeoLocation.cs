using System;
using System.Collections.Generic;

namespace TodoApi.Models;

public partial class GeoLocation
{
    public int Id { get; set; }

    public int? ParentId { get; set; }

    public string Name { get; set; } = null!;

    public decimal? Latitude { get; set; }

    public decimal? Longitude { get; set; }

    public virtual ICollection<GeoLocation> InverseParent { get; set; } = new List<GeoLocation>();

    public virtual ICollection<Object> Objects { get; set; } = new List<Object>();

    public virtual GeoLocation? Parent { get; set; }
}
