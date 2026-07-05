namespace TodoApi.DTOs;

/// <summary>Request-DTO zum Bestätigen/Übernehmen eines von GBIF vorgeschlagenen Taxonomie-Eintrags anhand seines UsageKey.</summary>
public class ConfirmGbifTaxonomyDto
{
    public int UsageKey { get; set; }
}