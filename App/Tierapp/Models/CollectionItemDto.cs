using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json;
using System.Text.Json.Serialization;
using Tierapp.Models;

namespace Tierapp.DTOs;

public partial class CollectionItemDto
{
    public int Id { get; set; }
    public string? Name { get; set; }
    public DateOnly? FindDate { get; set; }
    public string? Status { get; set; }
    public TaxonomyDto? Taxonomy { get; set; }

    [JsonConverter(typeof(FlexibleStringConverter))]
    public string? FindingLocation { get; set; }
    public string? Kategorie { get; set; }
    public string? Lebensraum { get; set; }
    public string? ImageUrl { get; set; }
    public string? Description { get; set; }
    public string? Sex { get; set; }
    public string? AgeClass { get; set; }
    public decimal? BodyMassGram { get; set; }
    public decimal? BodyLengthMm { get; set; }
    public bool ImageStoredInDatabase { get; set; }
    public int? ImageId { get; set; }
}

public class TaxonomyDto
{
    public int Id { get; set; }
    public string? Name { get; set; }
    public string? Rank { get; set; }
}

public class ImageDto
{
    public int Id { get; set; }
    public string? ImageUrl { get; set; }
    public DateTime? CreatedAt { get; set; }
}