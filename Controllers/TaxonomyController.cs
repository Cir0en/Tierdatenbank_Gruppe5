using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TodoApi.Models;

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
        public async Task<ActionResult<IEnumerable<Taxonomy>>> GetTaxonomies()
        {
            return await _context.Taxonomies.ToListAsync();
        }

        [HttpGet("{id}")]
        public async Task<ActionResult<Taxonomy>> GetTaxonomy(int id)
        {
            var taxonomy = await _context.Taxonomies.FindAsync(id);

            if (taxonomy == null) return NotFound();
            return taxonomy;
        }
    }
}