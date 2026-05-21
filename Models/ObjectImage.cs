using System;
using System.Collections.Generic;

namespace TodoApi.Models;

public partial class ObjectImage
{
    public int Id { get; set; }

    public int? ObjectId { get; set; }

    public string ImageUrl { get; set; } = null!;

    public DateTime? CreatedAt { get; set; }

    public virtual CollectItem? Object { get; set; }
}
