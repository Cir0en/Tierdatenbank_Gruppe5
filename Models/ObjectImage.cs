using System;
using System.Collections.Generic;

namespace TodoApi.Models;

/// <summary>
/// Repräsentiert ein Bild (Tabelle "object_images"), das zu genau einem <see cref="CollectItem"/>
/// (<see cref="Object"/>) gehört. Wird das zugehörige CollectItem gelöscht, werden die Bilder
/// per DB-Cascade mitgelöscht.
/// </summary>
public partial class ObjectImage
{
    public int Id { get; set; }

    public int? ObjectId { get; set; }

    /// <summary>Pfad/URL zur Bilddatei (z.B. unterhalb von "/uploads", siehe Program.cs).</summary>
    public string ImageUrl { get; set; } = null!;

    public DateTime? CreatedAt { get; set; }

    public virtual CollectItem? Object { get; set; }
}
