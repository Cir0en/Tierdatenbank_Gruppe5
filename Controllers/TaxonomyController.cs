using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TodoApi.Models;
using TodoApi.DTOs;

namespace TodoApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class TaxonomyController : ControllerBase
    {
        private readonly NeondbContext _context;

        public TaxonomyController(NeondbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<object>>> GetTaxonomies()
        {
            var taxonomies = await _context.Taxonomies
                .Select(t => new
                {
                    id = t.Id,
                    parentId = t.ParentId,
                    name = t.Name,
                    rank = t.Rank,
                    isApproved = t.IsApproved
                })
                .ToListAsync();
            return Ok(taxonomies);
        }

        [HttpGet("{id}")]
        public async Task<ActionResult<object>> GetTaxonomy(int id)
        {
            var taxonomy = await _context.Taxonomies
                .Where(t => t.Id == id)
                .Select(t => new
                {
                    id = t.Id,
                    parentId = t.ParentId,
                    name = t.Name,
                    rank = t.Rank,
                    isApproved = t.IsApproved
                })
                .FirstOrDefaultAsync();

            if (taxonomy == null) return NotFound();
            return Ok(taxonomy);
        }

        [HttpPost]
        public async Task<ActionResult<object>> CreateTaxonomy(CreateTaxonomyDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Name))
                return BadRequest("Name ist erforderlich.");

            if (dto.ParentId.HasValue)
            {
                var parentExists = await _context.Taxonomies.AnyAsync(t => t.Id == dto.ParentId.Value);
                if (!parentExists) return BadRequest("Übergeordneter Eintrag existiert nicht.");
            }

            var taxonomy = new Taxonomy
            {
                Name = dto.Name.Trim(),
                Rank = dto.Rank?.Trim(),
                ParentId = dto.ParentId,
                IsApproved = false
            };

            _context.Taxonomies.Add(taxonomy);
            await _context.SaveChangesAsync();

            return Ok(new
            {
                id = taxonomy.Id,
                parentId = taxonomy.ParentId,
                name = taxonomy.Name,
                rank = taxonomy.Rank,
                isApproved = taxonomy.IsApproved
            });
        }
    }
}