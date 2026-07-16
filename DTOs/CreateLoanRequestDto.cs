namespace TodoApi.DTOs;

/// <summary>Request-DTO zum Anfragen einer Ausleihe für ein fremdes Objekt (Entleiher = aktueller Nutzer).</summary>
public class CreateLoanRequestDto
{
    public int ObjectId { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
}
