using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using TodoApi.Models;

namespace TodoApi.Controllers
{
    [ApiController]
    [Route("api/images")]
    public class ImageController : ControllerBase
    {
        private readonly NeondbContext _context;
        private readonly IWebHostEnvironment _env;

        private static readonly string[] AllowedTypes =
            ["image/jpeg", "image/png", "image/gif", "image/webp"];

        public ImageController(NeondbContext context, IWebHostEnvironment env)
        {
            _context = context;
            _env = env;
        }

        // GET /api/images/{animalId}
        [HttpGet("{animalId:int}")]
        [AllowAnonymous]
        public async Task<ActionResult<IEnumerable<object>>> GetImages(int animalId)
        {
            var images = await _context.ObjectImages
                .Where(i => i.ObjectId == animalId)
                .OrderBy(i => i.CreatedAt)
                .Select(i => new { i.Id, i.ImageUrl, i.CreatedAt })
                .ToListAsync();

            return Ok(images);
        }

        // POST /api/images/upload/{animalId}
        [HttpPost("upload/{animalId:int}")]
        [AllowAnonymous]
        [RequestSizeLimit(10 * 1024 * 1024)] // 10 MB
        public async Task<ActionResult<object>> UploadImage(int animalId, [FromForm] IFormFile file)
        {
            if (file == null || file.Length == 0)
                return BadRequest("Keine Datei ausgewählt.");

            if (!AllowedTypes.Contains(file.ContentType.ToLower()))
                return BadRequest("Nur JPEG, PNG, GIF oder WebP erlaubt.");

            var exists = await _context.CollectItems.AnyAsync(c => c.Id == animalId);
            if (!exists) return NotFound("Tier nicht gefunden.");

            // Vorhandenes Bild löschen (1-Bild-Limit)
            var existing = await _context.ObjectImages.FirstOrDefaultAsync(i => i.ObjectId == animalId);
            if (existing != null)
            {
                var oldPath = Path.Combine(_env.ContentRootPath,
                    existing.ImageUrl.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));
                if (System.IO.File.Exists(oldPath)) System.IO.File.Delete(oldPath);
                _context.ObjectImages.Remove(existing);
            }

            var folder = Path.Combine(_env.ContentRootPath, "uploads", animalId.ToString());
            Directory.CreateDirectory(folder);

            var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
            var filename = $"{Guid.NewGuid()}{ext}";
            var filePath = Path.Combine(folder, filename);

            using (var stream = new FileStream(filePath, FileMode.Create))
                await file.CopyToAsync(stream);

            var imageUrl = $"/uploads/{animalId}/{filename}";
            var image = new ObjectImage
            {
                ObjectId = animalId,
                ImageUrl = imageUrl,
                CreatedAt = DateTime.UtcNow
            };

            _context.ObjectImages.Add(image);
            await _context.SaveChangesAsync();

            return Ok(new { image.Id, image.ImageUrl, image.CreatedAt });
        }

        // DELETE /api/images/{imageId}
        [HttpDelete("{imageId:int}")]
        [AllowAnonymous]
        public async Task<IActionResult> DeleteImage(int imageId)
        {
            var image = await _context.ObjectImages.FindAsync(imageId);
            if (image == null) return NotFound();

            // Datei vom Datenträger löschen
            var relativePath = image.ImageUrl.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
            var filePath = Path.Combine(_env.ContentRootPath, relativePath);
            if (System.IO.File.Exists(filePath))
                System.IO.File.Delete(filePath);

            _context.ObjectImages.Remove(image);
            await _context.SaveChangesAsync();

            return NoContent();
        }
    }
}
