using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TodoApi.Models;
using TodoApi.DTOs;

// später adden: normale Nutzer dürfen Funde nur in eigenen Collections anlegen oder ändern

namespace TodoApi.Controllers
{
    /// <summary>
    /// Verwaltet die gesammelten Tier-/Fundobjekte (CollectItems): Anlegen, Auflisten,
    /// Dashboard-Übersicht und CSV-Export. Aktuell ohne [Authorize]-Einschränkung
    /// (siehe TODO oben: normale Nutzer sollen später nur in eigenen Collections anlegen/ändern dürfen).
    /// </summary>
    [ApiController]
    [Route("api/animals")]
    public class AnimalsController : ControllerBase
    {
        private readonly NeondbContext _context;

        public AnimalsController(NeondbContext context)
        {
            _context = context;
        }

        // GET /api/animals — liefert alle Fundobjekte ohne Filterung/Includes (roh, für einfache Listen)
        [HttpGet]
        public async Task<ActionResult<IEnumerable<CollectItem>>> GetAnimals()
        {
            return await _context.CollectItems.ToListAsync();
        }

        // GET /api/animals/{id} — Detailansicht eines Fundobjekts inkl. Taxonomie, Sammlung und Fundort
        [HttpGet("{id}")]
        public async Task<ActionResult<CollectItem>> GetAnimal(int id)
        {
            var obj = await _context.CollectItems
                .Include(o => o.Taxonomy)
                .Include(o => o.Collection)
                .Include(o => o.FindingLocation)
                .FirstOrDefaultAsync(o => o.Id == id);

            if (obj == null) return NotFound();
            return obj;
        }

        // GET /api/animals/dashboard — schlanke Projektion für die Dashboard-Tabelle;
        // fehlender Status wird auf "ausstehend" gemappt, da neue Objekte ohne explizite Statuswahl entstehen können
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
                    c.FindDate,
                    c.CollectionId,
                    Status = c.Status ?? "ausstehend"
                })
                .ToListAsync();
            return Ok(items);
        }

        // GET /api/animals/export/csv — exportiert die gesamte Sammlung als CSV-Datei (inkl. Taxonomie-Rangnamen als eigene Spalten)
        [HttpGet("export/csv")]
        public async Task<IActionResult> ExportCsv()
        {
            var items = await _context.CollectItems
                .Include(c => c.Taxonomy)
                .Include(c => c.Collection)
                .Include(c => c.FindingLocation)
                .OrderBy(c => c.Id)
                .ToListAsync();

            // CSV-Escaping: Werte mit Komma, Anführungszeichen oder Zeilenumbruch müssen in
            // Anführungszeichen gesetzt werden, enthaltene Anführungszeichen werden verdoppelt (RFC 4180)
            static string Esc(string? v) =>
                v == null ? "" : v.Contains(',') || v.Contains('"') || v.Contains('\n')
                    ? $"\"{v.Replace("\"", "\"\"")}\"" : v;

            var sb = new StringBuilder();
            sb.AppendLine("ID,Name,Status,Geschlecht,Altersklasse,Funddatum,Koerpermasse_g,Koerperlaenge_mm,Art,Gattung,Familie,Ordnung,Klasse,Stamm,Sammlung,Fundort,Beschreibung,Aufbewahrungsort");

            foreach (var c in items)
            {
                var tax = c.Taxonomy;
                sb.AppendLine(string.Join(",",
                    c.Id,
                    Esc(c.Name),
                    Esc(c.Status),
                    Esc(c.Sex),
                    Esc(c.AgeClass),
                    c.FindDate.HasValue ? c.FindDate.Value.ToString("yyyy-MM-dd") : "",
                    c.BodyMassGram.HasValue   ? c.BodyMassGram.Value.ToString("F2")   : "",
                    c.BodyLengthMm.HasValue   ? c.BodyLengthMm.Value.ToString("F2")   : "",
                    // Jede Taxonomie-Ebene bekommt eine eigene CSV-Spalte; da ein CollectItem nur eine
                    // Taxonomy-Zuordnung hat (typischerweise auf Rang "Art"), wird hier je Rang geprüft
                    // und nur die passende Spalte befüllt, alle anderen bleiben leer.
                    Esc(tax?.Rank == "Art"     ? tax.Name : null),
                    Esc(tax?.Rank == "Gattung" ? tax.Name : null),
                    Esc(tax?.Rank == "Familie" ? tax.Name : null),
                    Esc(tax?.Rank == "Ordnung" ? tax.Name : null),
                    Esc(tax?.Rank == "Klasse"  ? tax.Name : null),
                    Esc(tax?.Rank == "Stamm"   ? tax.Name : null),
                    Esc(c.Collection?.Name),
                    Esc(c.FindingLocation?.Name),
                    Esc(c.Description),
                    Esc(c.StorageInfo)
                ));
            }

            // UTF-8-BOM voranstellen, damit Excel & Co. die Datei korrekt als UTF-8 erkennen
            var bytes = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(sb.ToString())).ToArray();
            var fileName = $"sammlung_{DateTime.UtcNow:yyyyMMdd}.csv";
            return File(bytes, "text/csv; charset=utf-8", fileName);
        }

        //FindDate = c.FindDate.HasValue ? c.FindDate.Value.ToDateTime(TimeOnly.MinValue).ToString("yyyy-MM-dd") : null
        // POST /api/animals — legt ein Fundobjekt direkt aus dem übergebenen Entity-Objekt an (ohne Validierung/DTO)
        [HttpPost]
        public async Task<ActionResult<CollectItem>> CreateAnimal(CollectItem item)
        {
            _context.CollectItems.Add(item);
            await _context.SaveChangesAsync();
            return CreatedAtAction(nameof(GetAnimal), new { id = item.Id }, item);
        }

        // POST /api/animals/map — legt ein Fundobjekt über die Kartenansicht an: validiert Koordinaten
        // und Fremdschlüssel (Collection/Taxonomy) und erstellt bei Bedarf einen neuen Fundort (GeoLocation).
        [HttpPost("map")]
        public async Task<ActionResult<CollectItem>> CreateMapAnimal(CreateMapAnimalDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Name))
            {
                return BadRequest("Name Artname fehlt");
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

            var locationName = string.IsNullOrWhiteSpace(dto.LocationName) ? "Unbekannter Fundort" : dto.LocationName;

            // Fundort wiederverwenden statt Duplikate anzulegen: gleicher Name + gleiche Koordinaten
            // gelten als derselbe Ort. Existiert er nicht, wird er neu angelegt.
            var location = await _context.GeoLocations
                .FirstOrDefaultAsync(g =>
                    g.Name == locationName &&
                    g.Latitude == dto.Latitude &&
                    g.Longitude == dto.Longitude);

            if (location == null)
            {
                location = new GeoLocation
                {
                    Name = locationName,
                    Latitude = dto.Latitude,
                    Longitude = dto.Longitude
                };

                _context.GeoLocations.Add(location);
                await _context.SaveChangesAsync();
            }

            var item = new CollectItem
            {
                Name = dto.Name,
                Sex = dto.Sex,
                AgeClass = dto.AgeClass,
                BodyMassGram = dto.BodyMassGram,
                BodyLengthMm = dto.BodyLengthMm,
                CollectionId = dto.CollectionId,
                TaxonomyId = dto.TaxonomyId,
                FindingLocationId = location.Id,
                FindDate = dto.FindDate,
                Description = dto.Description,
                // Ohne explizite Statusangabe startet jedes neue Fundobjekt als "ausstehend" (Moderationsworkflow)
                Status = string.IsNullOrWhiteSpace(dto.Status) ? "ausstehend" : dto.Status,
            };

            _context.CollectItems.Add(item);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetAnimal), new { id = item.Id }, item);
        }
    }
}
