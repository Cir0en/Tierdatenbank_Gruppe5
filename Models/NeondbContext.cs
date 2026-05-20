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

    public virtual DbSet<Location> Locations { get; set; }

    public virtual DbSet<ObjectImage> ObjectImages { get; set; }

    public virtual DbSet<StorageLocation> StorageLocations { get; set; }

    public virtual DbSet<Taxonomy> Taxonomies { get; set; }

    public virtual DbSet<User> Users { get; set; }

    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
        => optionsBuilder.UseNpgsql("Name=ConnectionStrings:DefaultConnection");

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<CollectItem>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("objects_pkey");

            entity.ToTable("collect_items");

            entity.HasIndex(e => e.CollectionId, "idx_objects_collection");

            entity.HasIndex(e => e.TaxonomyId, "idx_objects_taxonomy");

            entity.Property(e => e.Id).HasColumnName("id").ValueGeneratedOnAdd();
            entity.Property(e => e.CollectionId).HasColumnName("collection_id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.Description).HasColumnName("description");
            entity.Property(e => e.FindDate).HasColumnName("find_date");
            entity.Property(e => e.FindingLocationId).HasColumnName("finding_location_id");
            entity.Property(e => e.Name).HasColumnName("name");
            entity.Property(e => e.StorageInfo).HasColumnName("storage_info");
            entity.Property(e => e.StorageLocationId).HasColumnName("storage_location_id");
            entity.Property(e => e.TaxonomyId).HasColumnName("taxonomy_id");
            entity.Property(e => e.Status).HasColumnName("status");
            entity.HasOne(d => d.Collection).WithMany(p => p.CollectItems)
                .HasForeignKey(d => d.CollectionId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("fk_objects_collection");

            entity.HasOne(d => d.FindingLocation).WithMany(p => p.CollectItems)
                .HasForeignKey(d => d.FindingLocationId)
                .OnDelete(DeleteBehavior.SetNull)
                .HasConstraintName("objects_finding_location_id_fkey");

            entity.HasOne(d => d.StorageLocation).WithMany(p => p.CollectItems)
                .HasForeignKey(d => d.StorageLocationId)
                .OnDelete(DeleteBehavior.SetNull)
                .HasConstraintName("objects_storage_location_id_fkey");

            entity.HasOne(d => d.Taxonomy).WithMany(p => p.CollectItems)
                .HasForeignKey(d => d.TaxonomyId)
                .OnDelete(DeleteBehavior.SetNull)
                .HasConstraintName("fk_objects_taxonomy");
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
                .OnDelete(DeleteBehavior.SetNull)
                .HasConstraintName("fk_collections_user");
        });

        modelBuilder.Entity<GeoLocation>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("geo_locations_pkey");

            entity.ToTable("geo_locations");

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.Latitude)
                .HasPrecision(9, 6)
                .HasColumnName("latitude");
            entity.Property(e => e.Longitude)
                .HasPrecision(9, 6)
                .HasColumnName("longitude");
            entity.Property(e => e.Name).HasColumnName("name");
            entity.Property(e => e.ParentId).HasColumnName("parent_id");

            entity.HasOne(d => d.Parent).WithMany(p => p.InverseParent)
                .HasForeignKey(d => d.ParentId)
                .OnDelete(DeleteBehavior.Restrict)
                .HasConstraintName("geo_locations_parent_id_fkey");
        });

        modelBuilder.Entity<Loan>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("loans_pkey");

            entity.ToTable("loans");

            entity.HasIndex(e => e.BorrowerId, "idx_loans_borrower");

            entity.HasIndex(e => e.LenderId, "idx_loans_lender");

            entity.HasIndex(e => e.ObjectId, "idx_loans_object");

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.BorrowerId).HasColumnName("borrower_id");
            entity.Property(e => e.EndDate).HasColumnName("end_date");
            entity.Property(e => e.LenderId).HasColumnName("lender_id");
            entity.Property(e => e.ObjectId).HasColumnName("object_id");
            entity.Property(e => e.StartDate).HasColumnName("start_date");
            entity.Property(e => e.Status).HasColumnName("status");

            entity.HasOne(d => d.Borrower).WithMany(p => p.LoanBorrowers)
                .HasForeignKey(d => d.BorrowerId)
                .OnDelete(DeleteBehavior.SetNull)
                .HasConstraintName("fk_loans_borrower");

            entity.HasOne(d => d.Lender).WithMany(p => p.LoanLenders)
                .HasForeignKey(d => d.LenderId)
                .OnDelete(DeleteBehavior.SetNull)
                .HasConstraintName("fk_loans_lender");

            entity.HasOne(d => d.Object).WithMany(p => p.Loans)
                .HasForeignKey(d => d.ObjectId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("fk_loans_object");
        });

        modelBuilder.Entity<Location>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("locations_pkey");

            entity.ToTable("locations");

            entity.HasIndex(e => e.ParentId, "idx_locations_parent");

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.Latitude)
                .HasPrecision(9, 6)
                .HasColumnName("latitude");
            entity.Property(e => e.Longitude)
                .HasPrecision(9, 6)
                .HasColumnName("longitude");
            entity.Property(e => e.Name).HasColumnName("name");
            entity.Property(e => e.ParentId).HasColumnName("parent_id");

            entity.HasOne(d => d.Parent).WithMany(p => p.InverseParent)
                .HasForeignKey(d => d.ParentId)
                .OnDelete(DeleteBehavior.Restrict)
                .HasConstraintName("fk_locations_parent");
        });

        modelBuilder.Entity<ObjectImage>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("object_images_pkey");

            entity.ToTable("object_images");

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.FileExtension).HasColumnName("file_extension");
            entity.Property(e => e.ImageData).HasColumnName("image_data");
            entity.Property(e => e.ObjectId).HasColumnName("object_id");

            entity.HasOne(d => d.Object).WithMany(p => p.ObjectImages)
                .HasForeignKey(d => d.ObjectId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("object_images_object_id_fkey");
        });

        modelBuilder.Entity<StorageLocation>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("storage_locations_pkey");

            entity.ToTable("storage_locations");

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.CollectionId).HasColumnName("collection_id");
            entity.Property(e => e.Description).HasColumnName("description");
            entity.Property(e => e.Name).HasColumnName("name");
            entity.Property(e => e.ParentId).HasColumnName("parent_id");

            entity.HasOne(d => d.Collection).WithMany(p => p.StorageLocations)
                .HasForeignKey(d => d.CollectionId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("storage_locations_collection_id_fkey");

            entity.HasOne(d => d.Parent).WithMany(p => p.InverseParent)
                .HasForeignKey(d => d.ParentId)
                .OnDelete(DeleteBehavior.Restrict)
                .HasConstraintName("storage_locations_parent_id_fkey");
        });

        modelBuilder.Entity<Taxonomy>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("taxonomy_pkey");

            entity.ToTable("taxonomy");

            entity.HasIndex(e => e.ParentId, "idx_taxonomy_parent");

            entity.HasIndex(e => new { e.Name, e.ParentId }, "unique_taxonomy_name_parent").IsUnique();

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.IsApproved)
                .HasDefaultValue(false)
                .HasColumnName("is_approved");
            entity.Property(e => e.Name).HasColumnName("name");
            entity.Property(e => e.ParentId).HasColumnName("parent_id");
            entity.Property(e => e.Rank).HasColumnName("rank");

            entity.HasOne(d => d.Parent).WithMany(p => p.InverseParent)
                .HasForeignKey(d => d.ParentId)
                .OnDelete(DeleteBehavior.Restrict)
                .HasConstraintName("fk_taxonomy_parent");
        });

        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("users_pkey");

            entity.ToTable("users");

            entity.HasIndex(e => e.Email, "users_email_key").IsUnique();

            entity.HasIndex(e => e.Username, "users_username_key").IsUnique();

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.Email).HasColumnName("email");
            entity.Property(e => e.PasswordHash).HasColumnName("password_hash");
            entity.Property(e => e.Role).HasColumnName("role");
            entity.Property(e => e.Username).HasColumnName("username");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
