using System.Text.Json.Serialization;

namespace TodoApi.DTOs;

/// <summary>Response-DTO, das die Antwort der externen GBIF-API (Art-Suche/-Details) auf unsere Modellstruktur abbildet.</summary>
public class GbifSpeciesDto
{
    public int? UsageKey { get; set; } // returned by /species/match
    public int? Key { get; set; } // returned by /species/{key} and /species/suggest

    public string? ScientificName { get; set; }
    public string? CanonicalName { get; set; }
    public string? Rank { get; set; }
    public string? Status { get; set; }
    public string? MatchType { get; set; }
    public int Confidence { get; set; }

    public string? Kingdom { get; set; }
    public string? Phylum { get; set; }

    [JsonPropertyName("class")]
    public string? ClassName { get; set; }

    public string? Order { get; set; }
    public string? Family { get; set; }
    public string? Genus { get; set; }
    public string? Species { get; set; }
}