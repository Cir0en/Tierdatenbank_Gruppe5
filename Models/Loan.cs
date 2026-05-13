using System;
using System.Collections.Generic;

namespace TodoApi.Models;

public partial class Loan
{
    public int Id { get; set; }

    public int? ObjectId { get; set; }

    public int? LenderId { get; set; }

    public int? BorrowerId { get; set; }

    public DateOnly? StartDate { get; set; }

    public DateOnly? EndDate { get; set; }

    public string? Status { get; set; }

    public virtual User? Borrower { get; set; }

    public virtual User? Lender { get; set; }

    public virtual Object? Object { get; set; }
}
