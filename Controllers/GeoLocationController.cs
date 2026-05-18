using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TodoApi.Models;

namespace TodoApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class GeoLocationController : ControllerBase
    {
        private readonly NeondbContext _context;

        public GeoLocationController(NeondbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<GeoLocation>>> GetGeoLocations()
        {
            return await _context.GeoLocations.ToListAsync();
        }

        [HttpGet("{id}")]
        public async Task<ActionResult<GeoLocation>> GetGeoLocation(int id)
        {
            var geoLocation = await _context.GeoLocations.FindAsync(id);

            if (geoLocation == null) return NotFound();
            return geoLocation;
        }
    }
}