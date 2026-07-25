using System;
using System.Collections.Generic;

namespace TodoApi.Models;

/// <summary>
/// Repräsentiert einen Anwendungsnutzer (Tabelle "users"). Die Authentifizierung selbst läuft über
/// Clerk (siehe Program.cs); <see cref="ClerkId"/> verknüpft diesen Datensatz mit dem externen
/// Clerk-Nutzerkonto (aus dem "sub"-Claim des JWT). Besitzt <see cref="Collections"/>, tritt in
/// <see cref="Loan"/>s als Verleiher (<see cref="LoanLenders"/>) oder Entleiher
/// (<see cref="LoanBorrowers"/>) auf und kann <see cref="Taxonomies"/> angelegt haben.
/// </summary>
public partial class User
{
    public int Id { get; set; }

    /// <summary>Externe, eindeutige Nutzer-ID aus Clerk (JWT "sub"-Claim); Basis für die Authentifizierung.</summary>
    public string ClerkId { get; set; } = null!;

    public string Username { get; set; } = null!;

    public string Email { get; set; } = null!;

    /// <summary>Rolle des Nutzers (z.B. "Nutzer", "Moderator", "Admin"); steuert Berechtigungen. Default: "Nutzer".</summary>
    public string? Role { get; set; }

    public DateTime? CreatedAt { get; set; }

    public string? FirstName { get; set; }

    public string? LastName { get; set; }

    public string? Institution { get; set; }

    /// <summary>Ob der Nutzer gesperrt ist; gesperrte Nutzer werden von der UserStatusMiddleware abgewiesen.</summary>
    public bool IsBanned { get; set; }

    /// <summary>Zeitpunkt eines Soft-Deletes; ungleich null bedeutet, das Konto gilt als gelöscht.</summary>
    public DateTime? DeletedAt { get; set; }

    public virtual ICollection<Collection> Collections { get; set; } = new List<Collection>();

    /// <summary>Ausleihen, bei denen dieser Nutzer als Entleiher auftritt.</summary>
    public virtual ICollection<Loan> LoanBorrowers { get; set; } = new List<Loan>();

    /// <summary>Ausleihen, bei denen dieser Nutzer als Verleiher auftritt.</summary>
    public virtual ICollection<Loan> LoanLenders { get; set; } = new List<Loan>();

    public virtual ICollection<Taxonomy> Taxonomies { get; set; } = new List<Taxonomy>();

    /// <summary>Fundobjekte (CollectItems), die dieser Nutzer angelegt hat.</summary>
    public virtual ICollection<CollectItem> CreatedCollectItems { get; set; } = new List<CollectItem>();
}
