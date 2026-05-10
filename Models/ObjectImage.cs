using System;
using System.Collections.Generic;

namespace TodoApi.Models;

public partial class ObjectImage
{
    public int Id { get; set; }

    public int? ObjectId { get; set; }

    public byte[] ImageData { get; set; } = null!;

    public string? FileExtension { get; set; }

    public DateTime? CreatedAt { get; set; }

    public virtual Object? Object { get; set; }
}
