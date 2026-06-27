namespace TodoApi.DTOs;

public class CreateLoanDto
{
    public int ObjectId { get; set; }
    public int BorrowerId { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
}
