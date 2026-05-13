using System;
using System.Collections.Generic;

namespace TodoApi.Models;

public partial class User
{
    public int Id { get; set; }

    public string Username { get; set; } = null!;

    public string Email { get; set; } = null!;

    public string PasswordHash { get; set; } = null!;

    public string? Role { get; set; }

    public DateTime? CreatedAt { get; set; }

    public virtual ICollection<Collection> Collections { get; set; } = new List<Collection>();

    public virtual ICollection<Loan> LoanBorrowers { get; set; } = new List<Loan>();

    public virtual ICollection<Loan> LoanLenders { get; set; } = new List<Loan>();
}
