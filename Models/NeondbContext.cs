using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore;

namespace TodoApi.Models;

public partial class NeondbContext : DbContext
{
    public NeondbContext()
    {
    }

    public NeondbContext(DbContextOptions<NeondbContext> options)
        : base(options)
    {
    }

    public virtual DbSet<CollectItem> CollectItems { get; set; }

    public virtual DbSet<Collection> Collections { get; set; }

    public virtual DbSet<GeoLocation> GeoLocations { get; set; }

    public virtual DbSet<Loan> Loans { get; set; }

    public virtual DbSet<ObjectImage> ObjectImages { get; set; }

    public virtual DbSet<Taxonomy> Taxonomies { get; set; }

    public virtual DbSet<User> Users { get; set; }

    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
        => optionsBuilder.UseNpgsql("Name=ConnectionStrings:DefaultConnection");

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<CollectItem>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("collect_items_pkey");

            entity.ToTable("collect_items");

            entity.HasIndex(e => e.CollectionId, "idx_items_collection");

            entity.HasIndex(e => e.TaxonomyId, "idx_items_taxonomy");

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.CollectionId).HasColumnName("collection_id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.Description).HasColumnName("description");
            entity.Property(e => e.FindDate).HasColumnName("find_date");
            entity.Property(e => e.FindingLocationId).HasColumnName("finding_location_id");
            entity.Property(e => e.Name).HasColumnName("name");
            entity.Property(e => e.Status).HasColumnName("status");
            entity.Property(e => e.StorageInfo).HasColumnName("storage_info");
            entity.Property(e => e.TaxonomyId).HasColumnName("taxonomy_id");
            entity.Property(e => e.Sex).HasColumnName("sex");
            entity.Property(e => e.AgeClass).HasColumnName("age_class");
            entity.Property(e => e.BodyMassGram).HasColumnName("body_mass_gram");
            entity.Property(e => e.BodyLengthMm).HasColumnName("body_length_mm");
            // Kategorie + Lebensraum: [NotMapped] bis ALTER TABLE ausgeführt wurde

            entity.HasOne(d => d.Collection).WithMany(p => p.CollectItems)
                .HasForeignKey(d => d.CollectionId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("collect_items_collection_id_fkey");

            entity.HasOne(d => d.FindingLocation).WithMany(p => p.CollectItems)
                .HasForeignKey(d => d.FindingLocationId)
                .OnDelete(DeleteBehavior.SetNull)
                .HasConstraintName("collect_items_finding_location_id_fkey");

            entity.HasOne(d => d.Taxonomy).WithMany(p => p.CollectItems)
                .HasForeignKey(d => d.TaxonomyId)
                .OnDelete(DeleteBehavior.SetNull)
                .HasConstraintName("collect_items_taxonomy_id_fkey");
        });

        modelBuilder.Entity<Collection>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("collections_pkey");

            entity.ToTable("collections");

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.Description).HasColumnName("description");
            entity.Property(e => e.IsPublic)
                .HasDefaultValue(false)
                .HasColumnName("is_public");
            entity.Property(e => e.Name).HasColumnName("name");
            entity.Property(e => e.UserId).HasColumnName("user_id");

            entity.HasOne(d => d.User).WithMany(p => p.Collections)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("collections_user_id_fkey");
        });

        modelBuilder.Entity<GeoLocation>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("geo_locations_pkey");

            entity.ToTable("geo_locations");

            entity.HasIndex(e => e.ExternalId, "geo_locations_external_id_key").IsUnique();

            entity.HasIndex(e => e.ParentId, "idx_geo_parent");

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.ExternalId).HasColumnName("external_id");
            entity.Property(e => e.Latitude)
                .HasPrecision(9, 6)
                .HasColumnName("latitude");
            entity.Property(e => e.Longitude)
                .HasPrecision(9, 6)
                .HasColumnName("longitude");
            entity.Property(e => e.Name).HasColumnName("name");
            entity.Property(e => e.ParentId).HasColumnName("parent_id");
            entity.Property(e => e.Type).HasColumnName("type");

            entity.HasOne(d => d.Parent).WithMany(p => p.InverseParent)
                .HasForeignKey(d => d.ParentId)
                .OnDelete(DeleteBehavior.Restrict)
                .HasConstraintName("geo_locations_parent_id_fkey");
        });

        modelBuilder.Entity<Loan>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("loans_pkey");

            entity.ToTable("loans");

            entity.HasIndex(e => e.ObjectId, "idx_loans_object");

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.BorrowerId).HasColumnName("borrower_id");
            entity.Property(e => e.EndDate).HasColumnName("end_date");
            entity.Property(e => e.LenderId).HasColumnName("lender_id");
            entity.Property(e => e.ObjectId).HasColumnName("object_id");
            entity.Property(e => e.StartDate).HasColumnName("start_date");
            entity.Property(e => e.Status)
                .HasDefaultValueSql("'offen'::text")
                .HasColumnName("status");

            entity.HasOne(d => d.Borrower).WithMany(p => p.LoanBorrowers)
                .HasForeignKey(d => d.BorrowerId)
                .OnDelete(DeleteBehavior.SetNull)
                .HasConstraintName("loans_borrower_id_fkey");

            entity.HasOne(d => d.Lender).WithMany(p => p.LoanLenders)
                .HasForeignKey(d => d.LenderId)
                .OnDelete(DeleteBehavior.SetNull)
                .HasConstraintName("loans_lender_id_fkey");

            entity.HasOne(d => d.Object).WithMany(p => p.Loans)
                .HasForeignKey(d => d.ObjectId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("loans_object_id_fkey");
        });

        modelBuilder.Entity<ObjectImage>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("object_images_pkey");

            entity.ToTable("object_images");

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.ImageUrl).HasColumnName("image_url");
            entity.Property(e => e.ObjectId).HasColumnName("object_id");

            entity.HasOne(d => d.Object).WithMany(p => p.ObjectImages)
                .HasForeignKey(d => d.ObjectId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("object_images_object_id_fkey");
        });

        modelBuilder.Entity<Taxonomy>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("taxonomy_pkey");

            entity.ToTable("taxonomy");

            entity.HasIndex(e => e.ParentId, "idx_taxonomy_parent");

            entity.HasIndex(e => new { e.Name, e.ParentId }, "unique_taxonomy_name_parent").IsUnique();

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.CreatedBy).HasColumnName("created_by");
            entity.Property(e => e.IsApproved)
                .HasDefaultValue(false)
                .HasColumnName("is_approved");
            entity.Property(e => e.Name).HasColumnName("name");
            entity.Property(e => e.ParentId).HasColumnName("parent_id");
            entity.Property(e => e.Rank).HasColumnName("rank");

            entity.HasOne(d => d.CreatedByNavigation).WithMany(p => p.Taxonomies)
                .HasForeignKey(d => d.CreatedBy)
                .OnDelete(DeleteBehavior.SetNull)
                .HasConstraintName("taxonomy_created_by_fkey");

            entity.HasOne(d => d.Parent).WithMany(p => p.InverseParent)
                .HasForeignKey(d => d.ParentId)
                .OnDelete(DeleteBehavior.Restrict)
                .HasConstraintName("taxonomy_parent_id_fkey");
        });

        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("users_pkey");

            entity.ToTable("users");

            entity.HasIndex(e => e.ClerkId, "idx_users_clerk_id");

            entity.HasIndex(e => e.ClerkId, "users_clerk_id_key").IsUnique();

            entity.HasIndex(e => e.Email, "users_email_key").IsUnique();

            entity.HasIndex(e => e.Username, "users_username_key").IsUnique();

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.ClerkId).HasColumnName("clerk_id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.Email).HasColumnName("email");
            entity.Property(e => e.FirstName).HasColumnName("first_name");
            entity.Property(e => e.Institution).HasColumnName("institution");
            entity.Property(e => e.LastName).HasColumnName("last_name");
            entity.Property(e => e.Role)
                .HasDefaultValueSql("'Nutzer'::text")
                .HasColumnName("role");
            entity.Property(e => e.Username).HasColumnName("username");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
