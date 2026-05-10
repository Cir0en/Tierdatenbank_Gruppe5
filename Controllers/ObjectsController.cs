using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TodoApi.Models;

namespace TodoApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ObjectsController : ControllerBase
    {
        private readonly NeondbContext _context;

        public ObjectsController(NeondbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<TodoApi.Models.Object>>> GetObjects()
        {
            return await _context.Objects.ToListAsync();
        }

        [HttpGet("{id}")]
        public async Task<ActionResult<TodoApi.Models.Object>> GetObject(int id)
        {
            var obj = await _context.Objects
                .Include(o => o.Taxonomy)
                .Include(o => o.Collection)
                .FirstOrDefaultAsync(o => o.Id == id);

            if (obj == null) return NotFound();
            return obj;
        }
    }
}