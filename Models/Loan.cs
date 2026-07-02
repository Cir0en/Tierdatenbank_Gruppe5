using System;
using System.Collections.Generic;

namespace TodoApi.Models;

/// <summary>
/// Repräsentiert einen Ausleihvorgang (Tabelle "loans") für ein <see cref="CollectItem"/>
/// (<see cref="Object"/>). Verknüpft einen verleihenden <see cref="Lender"/> und einen
/// ausleihenden <see cref="Borrower"/> (jeweils <see cref="User"/>). Pro Objekt darf laut
/// DB-Constraint gleichzeitig nur eine offene ("offen") Ausleihe existieren.
/// </summary>
public partial class Loan
{
    public int Id { get; set; }

    public int? ObjectId { get; set; }

    public int? LenderId { get; set; }

    public int? BorrowerId { get; set; }

    public DateOnly? StartDate { get; set; }

    public DateOnly? EndDate { get; set; }

    /// <summary>Status der Ausleihe (z.B. "offen", "zurückgegeben"); Default in der DB ist "offen".</summary>
    public string? Status { get; set; }

    public virtual User? Borrower { get; set; }

    public virtual User? Lender { get; set; }

    public virtual CollectItem? Object { get; set; }
}
