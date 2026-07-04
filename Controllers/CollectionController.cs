using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TodoApi.Models;
using TodoApi.DTOs;
using Microsoft.AspNetCore.Authorization;

namespace TodoApi.Controllers
{
    /// <summary>
    /// Verwaltet Sammlungen (Collections), also die Container, in denen Nutzer ihre Fundobjekte
    /// organisieren. Sichtbarkeit/Berechtigungen werden nicht über [Authorize], sondern manuell über
    /// <see cref="GetCurrentUserAsync"/> (Clerk-Header/JWT) und <see cref="CanModifyCollection"/>
    /// geprüft: Eigentümer dürfen ihre eigenen Sammlungen bearbeiten/löschen, Admin/Moderator dürfen
    /// alle Sammlungen moderieren, öffentliche Sammlungen (IsPublic) sind für alle lesbar.
    /// </summary>
    [ApiController]
    [Route("api/collections")]
    public class CollectionController : ControllerBase
    {
        private readonly NeondbContext _context;

        public CollectionController(NeondbContext context)
        {
            _context = context;
        }

        // GET /api/collections — listet alle für den aktuellen Nutzer sichtbaren Sammlungen:
        // öffentliche Sammlungen, eigene Sammlungen sowie (bei Admin/Moderator) sämtliche Sammlungen
        [HttpGet]
        [AllowAnonymous]
        public async Task<ActionResult<IEnumerable<CollectionListDto>>> GetCollections()
        {
            var currentUser = await GetCurrentUserAsync();

            var canModerate = currentUser != null && CanModerateCollections(currentUser);

            var collections = await _context.Collections
                .Where(c =>
                    c.IsPublic == true ||
                    currentUser != null && c.UserId == currentUser.Id ||
                    canModerate)
                .Select(c => new CollectionListDto
                {
                    Id = c.Id,
                    Name = c.Name,
                    Description = c.Description,
                    IsPublic = c.IsPublic ?? false,
                    ItemCount = c.CollectItems.Count,
                    OwnerUsername = c.User != null ? c.User.Username : null,

                    IsOwner = currentUser != null && c.UserId == currentUser.Id,
                    CanEdit = currentUser != null && (canModerate || c.UserId == currentUser.Id),
                    CanDelete = currentUser != null && (canModerate || c.UserId == currentUser.Id)
                })
                .ToListAsync();

            return Ok(collections);
        }




        // GET /api/collections/{id} — Detailansicht einer Sammlung inkl. aller enthaltenen Fundobjekte;
        // nicht-öffentliche Sammlungen sind nur für Eigentümer und Admin/Moderator sichtbar
        [HttpGet("{id}")]
        [AllowAnonymous]
        public async Task<ActionResult<CollectionDetailDto>> GetCollection(int id)
        {
            var currentUser = await GetCurrentUserAsync();
            var canModerate = currentUser != null && CanModerateCollections(currentUser);

            var collection = await _context.Collections
                .Where(c => c.Id == id)
                .Where(c =>
                    c.IsPublic == true ||
                    currentUser != null && c.UserId == currentUser.Id ||
                    canModerate)
                .Select(c => new CollectionDetailDto
                {
                    Id = c.Id,
                    Name = c.Name,
                    Description = c.Description,
                    IsPublic = c.IsPublic ?? false,
                    OwnerUsername = c.User != null ? c.User.Username : null,

                    IsOwner = currentUser != null && c.UserId == currentUser.Id,
                    CanEdit = currentUser != null && (canModerate || c.UserId == currentUser.Id),
                    CanDelete = currentUser != null && (canModerate || c.UserId == currentUser.Id),

                    Items = c.CollectItems.Select(item => new CollectionItemDto
                    {
                        Id = item.Id,
                        Name = item.Name,
                        FindDate = item.FindDate,
                        Status = item.Status,
                        Kategorie = item.Kategorie,
                        Lebensraum = item.Lebensraum,
                        TaxonomyName = item.Taxonomy != null ? item.Taxonomy.Name : null,
                        TaxonomyRank = item.Taxonomy != null ? item.Taxonomy.Rank : null,
                        FindingLocation = item.FindingLocation != null ? item.FindingLocation.Name : null,
                        // ältestes hochgeladenes Bild dient als Vorschaubild in der Sammlungsliste
                        ImageId = item.ObjectImages
                            .OrderBy(img => img.CreatedAt)
                            .Select(img => (int?)img.Id)
                            .FirstOrDefault(),


                        ImageUrl = item.ObjectImages
                            .OrderBy(img => img.CreatedAt)
                            .Select(img => img.ImageUrl)
                            .FirstOrDefault(),

                        ImageStoredInDatabase = item.ObjectImages
                            .OrderBy(img => img.CreatedAt)
                            .Select(img => img.ImageData != null)
                            .FirstOrDefault(),

                        Description = item.Description,
                        Sex = item.Sex,
                        AgeClass = item.AgeClass,
                        BodyMassGram = item.BodyMassGram,
                        BodyLengthMm = item.BodyLengthMm,
                    }).ToList()
                })
                .FirstOrDefaultAsync();


            if (collection == null) return NotFound();

            foreach (var item in collection.Items)
            {
                if (item.ImageStoredInDatabase && item.ImageId.HasValue)
                {
                    item.ImageUrl =
                        $"/api/images/{item.ImageId.Value}/content";
                }
            }

            return Ok(collection);
        }


        // POST /api/collections — legt eine neue Sammlung für den aktuell angemeldeten Nutzer an.
        // Trotz [AllowAnonymous] wird intern ein gültiger Nutzer verlangt (siehe GetCurrentUserAsync),
        // die Route bleibt aber offen für z.B. anonyme Header-basierte Auth statt reinem JWT.
        [HttpPost]
        [AllowAnonymous]
        public async Task<ActionResult<CollectionDetailDto>> CreateCollection(CreateCollectionDto dto)
        {
            var currentUser = await GetCurrentUserAsync();

            if (currentUser == null)
            {
                return Unauthorized(new { message = "Nutzer nicht gefunden. Bitte melde dich an." });
            }

            var collection = new Collection
            {
                UserId = currentUser.Id,
                Name = dto.Name,
                Description = dto.Description,
                IsPublic = dto.IsPublic
            };

            _context.Collections.Add(collection);
            await _context.SaveChangesAsync();

            var result = new CollectionDetailDto
            {
                Id = collection.Id,
                Name = collection.Name,
                Description = collection.Description,
                IsPublic = collection.IsPublic ?? false,
                OwnerUsername = currentUser.Username,
                IsOwner = true,
                CanEdit = true,
                CanDelete = true,
                Items = new List<CollectionItemDto>()
            };

            return CreatedAtAction(nameof(GetCollection), new { id = collection.Id }, result);
        }

        // PUT /api/collections/{id} — aktualisiert Name/Beschreibung/Sichtbarkeit einer Sammlung;
        // nur Eigentümer oder Admin/Moderator dürfen ändern (CanModifyCollection)
        [HttpPut("{id}")]
        [AllowAnonymous]
        public async Task<IActionResult> UpdateCollection(int id, UpdateCollectionDto dto)
        {
            var currentUser = await GetCurrentUserAsync();

            if (currentUser == null)
            {
                return Unauthorized();
            }

            var collection = await _context.Collections.FindAsync(id);

            if (collection == null)
            {
                return NotFound();
            }

            if (!CanModifyCollection(currentUser, collection))
            {
                return Forbid();
            }

            collection.Name = dto.Name;
            collection.Description = dto.Description;
            collection.IsPublic = dto.IsPublic;

            await _context.SaveChangesAsync();

            return NoContent();
        }

        // DELETE /api/collections/{id} — löscht eine Sammlung; nur Eigentümer oder Admin/Moderator dürfen löschen
        [HttpDelete("{id}")]
        [AllowAnonymous]
        public async Task<IActionResult> DeleteCollection(int id)
        {
            var currentUser = await GetCurrentUserAsync();

            if (currentUser == null)
            {
                return Unauthorized();
            }

            var collection = await _context.Collections.FindAsync(id);

            if (collection == null)
            {
                return NotFound();
            }

            if (!CanModifyCollection(currentUser, collection))
            {
                return Forbid();
            }

            _context.Collections.Remove(collection);
            await _context.SaveChangesAsync();

            return NoContent();
        }

        // Ermittelt den aktuell angemeldeten Nutzer aus dem Request. Gibt null zurück, wenn kein
        // Nutzer identifiziert werden kann (z.B. bei anonymen Anfragen) — Aufrufer behandeln das
        // dann als "nicht eingeloggt" statt eine Exception zu werfen.
        private async Task<User?> GetCurrentUserAsync()
        {
            // Versuche zuerst den Clerk-User-Id Header (für Frontends ohne JWT-Setup)
            var clerkId = Request.Headers["X-Clerk-User-Id"].FirstOrDefault();

            // Fallback: JWT sub claim
            if (string.IsNullOrWhiteSpace(clerkId))
                clerkId = User.FindFirst("sub")?.Value;

            if (string.IsNullOrWhiteSpace(clerkId))
                return null;

            return await _context.Users
                .FirstOrDefaultAsync(u => u.ClerkId == clerkId);
        }

        // Bearbeitungsrecht: Eigentümer der Sammlung oder ein Nutzer mit Moderationsrechten (Admin/Moderator)
        private static bool CanModifyCollection(User user, Collection collection)
        {
            return CanModerateCollections(user) || collection.UserId == user.Id;
        }

        // Moderationsrechte gelten für die Rollen Admin und Moderator
        private static bool CanModerateCollections(User user)
        {
            return user.Role == "Admin"
                || user.Role == "Moderator";
        }
    }
}





