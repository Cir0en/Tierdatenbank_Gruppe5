using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TodoApi.Models;
using TodoApi.DTOs;
using Microsoft.AspNetCore.Authorization;

namespace TodoApi.Controllers
{
    [ApiController]
    [Route("api/collections")]
    public class CollectionController : ControllerBase
    {
        private readonly NeondbContext _context;

        public CollectionController(NeondbContext context)
        {
            _context = context;
        }

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
                        Status          = item.Status,
                        Kategorie       = item.Kategorie,
                        Lebensraum      = item.Lebensraum,
                        TaxonomyName    = item.Taxonomy != null ? item.Taxonomy.Name : null,
                        TaxonomyRank    = item.Taxonomy != null ? item.Taxonomy.Rank : null,
                        FindingLocation = item.FindingLocation != null ? item.FindingLocation.Name : null,
                        ImageUrl = item.ObjectImages
                            .OrderBy(img => img.CreatedAt)
                            .Select(img => img.ImageUrl)
                            .FirstOrDefault(),
                        Description  = item.Description,
                        Sex          = item.Sex,
                        AgeClass     = item.AgeClass,
                        BodyMassGram = item.BodyMassGram,
                        BodyLengthMm = item.BodyLengthMm,
                    }).ToList()
                })
                .FirstOrDefaultAsync();


            if (collection == null) return NotFound();
            return Ok(collection);
        }


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

        private static bool CanModifyCollection(User user, Collection collection)
        {
            return CanModerateCollections(user) || collection.UserId == user.Id;
        }

        private static bool CanModerateCollections(User user)
        {
            return user.Role == "Admin"
                || user.Role == "Moderator";
        }
    }
}





