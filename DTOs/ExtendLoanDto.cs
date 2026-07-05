namespace TodoApi.DTOs;

/// <summary>Request-DTO zum Verlängern einer aktiven Ausleihe (neues Rückgabedatum).</summary>
public class ExtendLoanDto
{
    public DateOnly NewEndDate { get; set; }
}
