namespace TodoApi.DTOs;

public class LoanDetailDto
{
    public int Id { get; set; }
    public int? ObjectId { get; set; }
    public string? ObjectName { get; set; }
    public int? LenderId { get; set; }
    public string? LenderName { get; set; }
    public string? LenderFirstName { get; set; }
    public string? LenderLastName { get; set; }
    public int? BorrowerId { get; set; }
    public string? BorrowerName { get; set; }
    public string? BorrowerFirstName { get; set; }
    public string? BorrowerLastName { get; set; }
    public DateOnly? StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public string? Status { get; set; }
    public bool IsOverdue { get; set; }
}
