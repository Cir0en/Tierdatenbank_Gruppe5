using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TodoApi.Models;

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
                .Select(c => new { c.Id, c.Name, c.TaxonomyId, c.FindingLocationId, c.FindDate
                ,
                c.CollectionId, Status = c.Status ?? "ausstehend" })
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
    }
}