using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using TodoApi.Models;

namespace TodoApi.Controllers
{
    /// <summary>
    /// Verwaltet Bild-Uploads für Fundobjekte (CollectItems). Bilder werden als Dateien im
    /// lokalen "uploads"-Verzeichnis gespeichert, in der DB wird nur der relative Pfad (ImageUrl)
    /// referenziert. Aktuell gilt ein 1-Bild-Limit pro Objekt: ein neuer Upload ersetzt ein
    /// vorhandenes Bild. Alle Endpunkte sind aktuell mit [AllowAnonymous] offen.
    /// </summary>
    [ApiController]
    [Route("api/images")]
    public class ImageController : ControllerBase
    {
        private readonly NeondbContext _context;

        // erlaubte MIME-Types für Uploads, um beliebige Dateitypen (z.B. ausführbare Dateien) auszuschließen
        private static readonly string[] AllowedTypes =
            ["image/jpeg", "image/png", "image/gif", "image/webp"];

        public ImageController(NeondbContext context)
        {
            _context = context;
        }

        // GET /api/images/{animalId}/content - Bilddaten aus Neon
        [HttpGet("{imageId:int}/content")]
        [AllowAnonymous]
        public async Task<IActionResult> GetImageContent(
            int imageId,
            CancellationToken cancellationToken)
        {
            var image = await _context.ObjectImages
                .AsNoTracking()
                .Where(i => i.Id == imageId)
                .Select(i => new
                {
                    i.ImageData,
                    i.ContentType
                })
                .FirstOrDefaultAsync(cancellationToken);

            if (image?.ImageData == null ||
                string.IsNullOrWhiteSpace(image.ContentType))
            {
                return NotFound();
            }

            Response.Headers.CacheControl = "public,max-age=86400";

            return File(image.ImageData, image.ContentType);
        }

        // GET /api/images/{animalId} - listet alle Bilder eines Fundobjekts (chronologisch nach Upload-Datum)
        [HttpGet("{animalId:int}")]
        [AllowAnonymous]
        public async Task<ActionResult<IEnumerable<object>>> GetImages(int animalId)
        {
            var images = await _context.ObjectImages
                .AsNoTracking()
                .Where(i => i.ObjectId == animalId)
                .OrderBy(i => i.CreatedAt)
                .Select(i => new
                {
                    i.Id,
                    StoredInDatabase = i.ImageData != null,
                    i.ImageUrl,
                    i.CreatedAt
                })
                .ToListAsync();

            var result = images.Select(i => new
            {
                i.Id,
                ImageUrl = i.StoredInDatabase
            ? $"/api/images/{i.Id}/content"
            : i.ImageUrl,
                i.CreatedAt
            });

            return Ok(result);
        }

        // POST /api/images/upload/{animalId} - lädt ein Bild für ein Fundobjekt hoch (max. 10 MB).
        // Ersetzt ein evtl. vorhandenes Bild des Objekts (1-Bild-Limit pro Objekt).
        [HttpPost("upload/{animalId:int}")]
        [AllowAnonymous]
        [RequestSizeLimit(11 * 1024 * 1024)] // 10 MB
        public async Task<ActionResult<object>> UploadImage(int animalId, [FromForm] IFormFile file, CancellationToken cancellationToken)
        {
            if (file == null || file.Length == 0)
                return BadRequest("Keine Datei ausgewählt.");

            if (file.Length > 10 * 1024 * 1024)
                return BadRequest("Das Bild darf maximal 10 MB groß sein.");

            var contentType = file.ContentType.ToLowerInvariant();

            if (!AllowedTypes.Contains(contentType))
                return BadRequest("Nur JPEG, PNG, GIF oder WebP erlaubt.");

            var exists = await _context.CollectItems.AnyAsync(c => c.Id == animalId, cancellationToken);
            if (!exists) return NotFound("Tier nicht gefunden.");

            // Vorhandenes Bild löschen (1-Bild-Limit): sowohl Datei auf der Festplatte
            // als auch den zugehörigen DB-Eintrag entfernen, bevor das neue Bild gespeichert wird

            await using var stream = new MemoryStream((int)file.Length);
            await file.CopyToAsync(stream, cancellationToken);


            var image = await _context.ObjectImages
                .FirstOrDefaultAsync(i => i.ObjectId == animalId,
                cancellationToken);
            if (image == null)
            {
                image = new ObjectImage
                {
                    ObjectId = animalId,
                    CreatedAt = DateTime.UtcNow
                };
                _context.ObjectImages.Add(image);
            }


            image.ImageUrl = null;
            image.ImageData = stream.ToArray();
            image.ContentType = contentType;
            image.OriginalFileName = Path.GetFileName(file.FileName);
            image.ByteSize = file.Length;
            image.CreatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync(cancellationToken);

            return Ok(new
            {
                image.Id,
                ImageUrl = $"/api/images/{image.Id}/content",
                image.CreatedAt
            });
        }



        /*
        {
            var oldPath = Path.Combine(_env.ContentRootPath,
                existing.ImageUrl.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));
            if (System.IO.File.Exists(oldPath)) System.IO.File.Delete(oldPath);
            _context.ObjectImages.Remove(existing);
        }

        var folder = Path.Combine(_env.ContentRootPath, "uploads", animalId.ToString());
        Directory.CreateDirectory(folder);

        // Zufälliger Dateiname (GUID) statt Originalname, um Kollisionen und Pfad-/Namenskonflikte zu vermeiden
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
    }*/

        // DELETE /api/images/{imageId} — löscht ein Bild sowohl aus der Datenbank als auch von der Festplatte
        [HttpDelete("{imageId:int}")]
        [AllowAnonymous]
        public async Task<IActionResult> DeleteImage(int imageId, CancellationToken cancellationToken)
        {
            var image = await _context.ObjectImages.FindAsync([imageId], cancellationToken);
            if (image == null) return NotFound();

            /*
            // Datei vom Datenträger löschen
            var relativePath = image.ImageUrl.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
            var filePath = Path.Combine(_env.ContentRootPath, relativePath);
            if (System.IO.File.Exists(filePath))
                System.IO.File.Delete(filePath);
            */

            _context.ObjectImages.Remove(image);
            await _context.SaveChangesAsync(cancellationToken);

            return NoContent();
        }
    }
}
