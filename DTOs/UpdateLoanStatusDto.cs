namespace TodoApi.DTOs;

/// <summary>Request-DTO zum Ändern des Status einer Ausleihe (z.B. "offen" -> "zurückgegeben").</summary>
public class UpdateLoanStatusDto
{
    public string Status { get; set; } = string.Empty;
}
