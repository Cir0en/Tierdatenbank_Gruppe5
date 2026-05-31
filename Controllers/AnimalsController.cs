using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TodoApi.Models;
using TodoApi.DTOs;

// später adden: normale Nutzer dürfen Funde nur in eigenen Collections anlegen oder ändern

namespace TodoApi.Controllers
{
    [ApiController]
    [Route("api/animals")]
    public class AnimalsController : ControllerBase
    {
        private readonly NeondbContext _context;

        public AnimalsController(NeondbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<CollectItem>>> GetAnimals()
        {
            return await _context.CollectItems.ToListAsync();
        }

        [HttpGet("{id}")]
        public async Task<ActionResult<CollectItem>> GetAnimal(int id)
        {
            var obj = await _context.CollectItems
                .Include(o => o.Taxonomy)
                .Include(o => o.Collection)
                .FirstOrDefaultAsync(o => o.Id == id);

            if (obj == null) return NotFound();
            return obj;
        }

        [HttpGet("dashboard")]
        public async Task<ActionResult> GetAnimal()
        {
            var items = await _context.CollectItems
                .Select(c => new
                {
                    c.Id,
                    c.Name,
                    c.TaxonomyId,
                    c.FindingLocationId,
                    c.FindDate
                ,
                    c.CollectionId,
                    Status = c.Status ?? "ausstehend"
                })
                .ToListAsync();
            return Ok(items);
        }
        //FindDate = c.FindDate.HasValue ? c.FindDate.Value.ToDateTime(TimeOnly.MinValue).ToString("yyyy-MM-dd") : null
        [HttpPost]
        public async Task<ActionResult<CollectItem>> CreateAnimal(CollectItem item)
        {
            _context.CollectItems.Add(item);
            await _context.SaveChangesAsync();
            return CreatedAtAction(nameof(GetAnimal), new { id = item.Id }, item);
        }

        [HttpPost("map")]
        public async Task<ActionResult<CollectItem>> CreateMapAnimal(CreateMapAnimalDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.SpeciesName))
            {
                return BadRequest("SpeciesName Artname fehlt");
            }

            if (dto.Latitude < -90 || dto.Latitude > 90)
            {
                return BadRequest("Latitude zwischen -90 und 90.");
            }

            if (dto.Longitude < -180 || dto.Longitude > 180)
            {
                return BadRequest("Longitude zwischen -180 und 180.");
            }

            if (dto.CollectionId.HasValue)
            {
                var collectionExists = await _context.Collections
                    .AnyAsync(c => c.Id == dto.CollectionId.Value);

                if (!collectionExists)
                {
                    return BadRequest("Collection existiert nicht");
                }
            }

            if (dto.TaxonomyId.HasValue)
            {
                var taxonomyExists = await _context.Taxonomies
                    .AnyAsync(t => t.Id == dto.TaxonomyId.Value);

                if (!taxonomyExists)
                {
                    return BadRequest("Taxonomy existiert nicht");
                }
            }

            var location = new GeoLocation
            {
                Name = string.IsNullOrWhiteSpace(dto.LocationName) ? "Unbekannter Fundort" : dto.LocationName,
                Latitude = dto.Latitude,
                Longitude = dto.Longitude
            };

            _context.GeoLocations.Add(location);
            await _context.SaveChangesAsync();

            var item = new CollectItem
            {
                Name = dto.SpeciesName,
                Sex = dto.Sex,
                AgeClass = dto.AgeClass,
                BodyMassGram = dto.BodyMassGram,
                BodyLengthMm = dto.BodyLengthMm,
                CollectionId = dto.CollectionId,
                TaxonomyId = dto.TaxonomyId,
                FindingLocationId = location.Id,
                FindDate = dto.FindDate,
                Status = "ausstehend"
            };

            _context.CollectItems.Add(item);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetAnimal), new { id = item.Id }, item);
        }
    }


}
