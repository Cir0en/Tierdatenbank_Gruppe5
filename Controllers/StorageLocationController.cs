using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TodoApi.Models;

namespace TodoApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class StorageLocationController : ControllerBase
    {
        private readonly NeondbContext _context;

        public StorageLocationController(NeondbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<StorageLocation>>> GetStorageLocations()
        {
            return await _context.StorageLocations.ToListAsync();
        }

        [HttpGet("{id}")]
        public async Task<ActionResult<StorageLocation>> GetStorageLocation(int id)
        {
            var storageLocation = await _context.StorageLocations.FindAsync(id);

            if (storageLocation == null) return NotFound();
            return storageLocation;
        }
    }
}