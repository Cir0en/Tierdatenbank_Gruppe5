namespace Tierapp.DTOs;

public class LoanListDto
{
    public int Id { get; set; }
    public string? BorrowerUsername { get; set; }
    public string? ItemName { get; set; }
    public string? LoanDate { get; set; }
    public string? ReturnDate { get; set; }
}