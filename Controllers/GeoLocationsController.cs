using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TodoApi.Models;
using TodoApi.DTOs;
using Microsoft.AspNetCore.Authorization;


namespace TodoApi.Controllers
{
    /// <summary>
    /// Verwaltet geografische Fundorte (GeoLocations), die hierarchisch (ParentId) organisiert sind,
    /// z.B. Kontinent -> Land -> Region. Wird u.a. für die Kartenansicht (map-items) und die
    /// Fundort-Auswahl beim Anlegen von Fundobjekten genutzt.
    /// </summary>
    [ApiController]
    [Route("api/geolocations")]
    public class GeoLocationsController : ControllerBase
    {
        private readonly NeondbContext _context;

        public GeoLocationsController(NeondbContext context)
        {
            _context = context;
        }

        // GET /api/geolocations — durchsuchbare/filterbare Liste aller Fundorte
        // (Suche nach Name, Filter nach übergeordnetem Ort und/oder Typ)
        [HttpGet]
        [AllowAnonymous]
        public async Task<ActionResult<IEnumerable<GeoLocationDto>>> GetGeoLocations(
            [FromQuery] string? search,
            [FromQuery] int? parentId,
            [FromQuery] string? type
        )
        {
            var query = _context.GeoLocations
                .AsNoTracking()
                .AsQueryable();

            if (!string.IsNullOrWhiteSpace(search))
            {
                var normalizedSearch = search.ToLower();

                query = query.Where(g =>
                    g.Name.ToLower().Contains(normalizedSearch));
            }

            if (parentId.HasValue)
            {
                query = query.Where(g => g.ParentId == parentId.Value);
            }

            if (!string.IsNullOrWhiteSpace(type))
            {
                query = query.Where(g => g.Type == type);
            }

            var locations = await query
                .OrderBy(g => g.Name)
                .Select(g => new GeoLocationDto
                {
                    Id = g.Id,
                    ParentId = g.ParentId,
                    ExternalId = g.ExternalId,
                    Name = g.Name,
                    Latitude = g.Latitude,
                    Longitude = g.Longitude,
                    Type = g.Type,
                    HasChildren = g.InverseParent.Any(),
                    ItemCount = g.CollectItems.Count
                })
                .ToListAsync();

            return Ok(locations);

        }

        // GET /api/geolocations/{id} — Detailansicht eines einzelnen Fundorts
        [HttpGet("{id}")]
        public async Task<ActionResult<GeoLocation>> GetGeoLocation(int id)
        {
            var location = await _context.GeoLocations
                .AsNoTracking()
                .Where(g => g.Id == id)
                .Select(g => new GeoLocationDto
                {
                    Id = g.Id,
                    ParentId = g.ParentId,
                    ExternalId = g.ExternalId,
                    Name = g.Name,
                    Latitude = g.Latitude,
                    Longitude = g.Longitude,
                    Type = g.Type,
                    HasChildren = g.InverseParent.Any(),
                    ItemCount = g.CollectItems.Count
                }).FirstOrDefaultAsync();
            if (location == null) return NotFound();
            return Ok(location);
        }

        // GET /api/geolocations/{id}/children — liefert die direkten Unterorte eines Fundorts
        // (für hierarchisches Aufklappen, z.B. Land -> Regionen)
        [HttpGet("{id}/children")]
        [AllowAnonymous]
        public async Task<ActionResult<IEnumerable<GeoLocationDto>>> GetChildren(int id)
        {
            var parentExists = await _context.GeoLocations
                .AnyAsync(g => g.Id == id);

            if (!parentExists)
            {
                return NotFound();
            }

            var children = await _context.GeoLocations
                .AsNoTracking()
                .Where(g => g.ParentId == id)
                .OrderBy(g => g.Name)
                .Select(g => new GeoLocationDto
                {
                    Id = g.Id,
                    ParentId = g.ParentId,
                    ExternalId = g.ExternalId,
                    Name = g.Name,
                    Latitude = g.Latitude,
                    Longitude = g.Longitude,
                    Type = g.Type,
                    HasChildren = g.InverseParent.Any(),
                    ItemCount = g.CollectItems.Count
                })
                .ToListAsync();

            return Ok(children);
        }


        // POST /api/geolocations — legt einen neuen Fundort an (erfordert Anmeldung).
        // Validiert Koordinatenbereiche, Existenz des übergeordneten Orts sowie Eindeutigkeit der ExternalId.
        [HttpPost]
        [Authorize]
        public async Task<ActionResult<GeoLocationDto>> CreateGeoLocation(CreateGeoLocationDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Name))
            {
                return BadRequest("Name is required.");
            }

            if (dto.Latitude.HasValue && (dto.Latitude < -90 || dto.Latitude > 90))
            {
                return BadRequest("Latitude must be between -90 and 90.");
            }

            if (dto.Longitude.HasValue && (dto.Longitude < -180 || dto.Longitude > 180))
            {
                return BadRequest("Longitude must be between -180 and 180.");
            }

            if (dto.ParentId.HasValue)
            {
                var parentExists = await _context.GeoLocations
                    .AnyAsync(g => g.Id == dto.ParentId.Value);

                if (!parentExists)
                {
                    return BadRequest("Parent location does not exist.");
                }
            }

            if (!string.IsNullOrWhiteSpace(dto.ExternalId))
            {
                var externalIdExists = await _context.GeoLocations
                    .AnyAsync(g => g.ExternalId == dto.ExternalId);

                if (externalIdExists)
                {
                    return BadRequest("A location with this external id already exists.");
                }
            }

            var location = new GeoLocation
            {
                ParentId = dto.ParentId,
                ExternalId = dto.ExternalId,
                Name = dto.Name,
                Latitude = dto.Latitude,
                Longitude = dto.Longitude,
                Type = dto.Type
            };

            _context.GeoLocations.Add(location);
            await _context.SaveChangesAsync();

            var result = new GeoLocationDto
            {
                Id = location.Id,
                ParentId = location.ParentId,
                ExternalId = location.ExternalId,
                Name = location.Name,
                Latitude = location.Latitude,
                Longitude = location.Longitude,
                Type = location.Type,
                HasChildren = false,
                ItemCount = 0
            };

            return CreatedAtAction(nameof(GetGeoLocation), new { id = location.Id }, result);
        }

        // GET /api/geolocations/map-items — liefert Fundobjekte mit Koordinaten für die Kartenansicht,
        // optional begrenzt auf einen sichtbaren Kartenausschnitt (Bounding Box aus west/south/east/north).
        // Nicht angemeldete Nutzer sehen nur Objekte ohne Sammlungszuordnung oder aus öffentlichen Sammlungen.
        [HttpGet("map-items")]
        [AllowAnonymous]
        public async Task<ActionResult<IEnumerable<GeoMapItemDto>>> GetMapItems(
            [FromQuery] decimal? west,
            [FromQuery] decimal? south,
            [FromQuery] decimal? east,
            [FromQuery] decimal? north)
        {
            var clerkId = Request.Headers["X-Clerk-User-Id"].FirstOrDefault();
            var isAuthenticated = !string.IsNullOrWhiteSpace(clerkId);

            User? currentUser = null;
            if (isAuthenticated)
            {
                currentUser = await _context.Users
                    .FirstOrDefaultAsync(u => u.ClerkId == clerkId && u.DeletedAt == null);
            }
            var canModerate = currentUser != null && (currentUser.Role == "Admin" || currentUser.Role == "Moderator");

            var query = _context.CollectItems
                .AsNoTracking()
                .Where(i =>
                    i.FindingLocation != null &&
                    i.FindingLocation.Latitude != null &&
                    i.FindingLocation.Longitude != null);

            // Nicht eingeloggte Nutzer sehen nur Einträge ohne Sammlung oder aus öffentlichen Sammlungen
            if (!isAuthenticated)
            {
                query = query.Where(i =>
                    i.CollectionId == null ||
                    i.Collection!.IsPublic == true);
            }

            if (west.HasValue && south.HasValue && east.HasValue && north.HasValue)
            {
                query = query.Where(i =>
                    i.FindingLocation!.Longitude >= west.Value &&
                    i.FindingLocation.Longitude <= east.Value &&
                    i.FindingLocation.Latitude >= south.Value &&
                    i.FindingLocation.Latitude <= north.Value);
            }

            var items = await query
                .Select(i => new GeoMapItemDto
                {
                    ItemId = i.Id,
                    ItemName = i.Name,

                    LocationId = i.FindingLocation!.Id,
                    LocationName = i.FindingLocation.Name,
                    Latitude = i.FindingLocation.Latitude!.Value,
                    Longitude = i.FindingLocation.Longitude!.Value,

                    CollectionId = i.CollectionId,
                    CollectionName = i.Collection != null ? i.Collection.Name : null,

                    TaxonomyId = i.TaxonomyId,
                    TaxonomyName = i.Taxonomy != null ? i.Taxonomy.Name : null,

                    Status = i.Status,

                    CanDelete = currentUser != null && (canModerate || i.CreatedByUserId == currentUser.Id)
                })
                .ToListAsync();

            return Ok(items);
        }




    }
}