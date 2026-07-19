using System.Globalization;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TodoApi.Models;
using TodoApi.DTOs;
using TodoApi.Services;

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
        private readonly ClerkUserProvisioningService _userProvisioning;

        public AnimalsController(NeondbContext context, ClerkUserProvisioningService userProvisioning)
        {
            _context = context;
            _userProvisioning = userProvisioning;
        }

        // GET /api/animals — liefert alle Fundobjekte ohne Filterung/Includes (roh, für einfache Listen)
        [HttpGet]
        public async Task<ActionResult<IEnumerable<CollectItem>>> GetAnimals()
        {
            return await _context.CollectItems.ToListAsync();
        }

        // GET /api/animals/{id} — Detailansicht eines Fundobjekts inkl. Taxonomie, Sammlung und Fundort;
        // enthält zusätzlich canEdit/canDelete für den anfragenden Nutzer (siehe CanEditItem/CanDeleteItem), damit
        // das Frontend den Bearbeiten-/Löschen-Button nur bei Berechtigung anzeigt.
        [HttpGet("{id}")]
        public async Task<ActionResult<object>> GetAnimal(int id)
        {
            var obj = await _context.CollectItems
                .Include(o => o.Taxonomy)
                .Include(o => o.Collection)
                .Include(o => o.FindingLocation)
                .FirstOrDefaultAsync(o => o.Id == id);

            if (obj == null) return NotFound();

            var currentUser = await GetCurrentUserAsync();
            // Bearbeiten: nur Eigentümer der Sammlung oder Admin. Löschen: zusätzlich Moderator/Ersteller
            // (Moderationsfunktion) — deshalb getrennte Flags.
            var canEdit = currentUser != null && CanEditItem(currentUser, obj);
            var canDelete = currentUser != null && CanDeleteItem(currentUser, obj);

            return Ok(new
            {
                obj.Id,
                obj.CollectionId,
                obj.TaxonomyId,
                obj.FindingLocationId,
                obj.Name,
                obj.FindDate,
                obj.Description,
                obj.StorageInfo,
                obj.CreatedAt,
                obj.Status,
                obj.Sex,
                obj.AgeClass,
                obj.Lebensraum,
                obj.BodyMassGram,
                obj.BodyLengthMm,
                Taxonomy = obj.Taxonomy == null ? null : new { obj.Taxonomy.Id, obj.Taxonomy.Name, obj.Taxonomy.Rank },
                Collection = obj.Collection == null ? null : new { obj.Collection.Id, obj.Collection.Name },
                FindingLocation = obj.FindingLocation == null ? null : new { obj.FindingLocation.Id, obj.FindingLocation.Name, obj.FindingLocation.Latitude, obj.FindingLocation.Longitude },
                CanEdit = canEdit,
                CanDelete = canDelete,
            });
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

        // Prüft, ob der aktuell angemeldete Nutzer die Rolle Moderator oder Admin hat
        // und weder gebannt noch (soft-)gelöscht ist. Gibt null zurück, wenn keine Berechtigung besteht.
        private async Task<User?> GetModOrAdminAsync()
        {
            var clerkId = User.FindFirst("sub")?.Value;
            if (string.IsNullOrWhiteSpace(clerkId)) return null;
            return await _context.Users.FirstOrDefaultAsync(u =>
                u.ClerkId == clerkId &&
                (u.Role == "Moderator" || u.Role == "Admin") &&
                !u.IsBanned &&
                u.DeletedAt == null);
        }

        // Spaltennamen der Rangstufen in der CSV, in der Reihenfolge, in der nach der ersten
        // befüllten Spalte gesucht wird (entspricht den vom Export erzeugten Spalten).
        private static readonly string[] TaxonomyRankColumns = ["Art", "Gattung", "Familie", "Ordnung", "Klasse", "Stamm"];

        // POST /api/animals/import/csv — importiert Fundobjekte aus einer CSV-Datei im gleichen
        // Format wie /export/csv erzeugt (Spalten werden per Header-Name gelesen, Reihenfolge ist
        // daher egal; die ID-Spalte wird ignoriert, jede Zeile erzeugt ein neues Fundobjekt).
        // Taxonomie/Sammlung/Fundort werden per Name wiederverwendet oder neu angelegt.
        // Nur für Moderator/Admin, da ein fehlerhafter Import viele Datensätze auf einmal betrifft.
        [HttpPost("import/csv")]
        [Authorize]
        [RequestSizeLimit(20 * 1024 * 1024)] // 20 MB
        public async Task<ActionResult> ImportCsv([FromForm] IFormFile? file)
        {
            var importer = await GetModOrAdminAsync();
            if (importer == null) return Forbid();

            if (file == null || file.Length == 0)
                return BadRequest("Keine Datei ausgewählt.");

            string content;
            using (var reader = new StreamReader(file.OpenReadStream(), Encoding.UTF8, detectEncodingFromByteOrderMarks: true))
                content = await reader.ReadToEndAsync();

            var rows = ParseCsv(content);
            if (rows.Count == 0) return BadRequest("Datei ist leer.");

            var header = rows[0];
            var col = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            for (int i = 0; i < header.Length; i++) col[header[i].Trim()] = i;

            if (!col.ContainsKey("Name"))
                return BadRequest("Spalte 'Name' fehlt im CSV-Header.");

            string? Get(string[] row, string name) =>
                col.TryGetValue(name, out var idx) && idx < row.Length && !string.IsNullOrWhiteSpace(row[idx])
                    ? row[idx].Trim() : null;

            // Caches für Find-or-Create: verhindern doppelte Anlage gleichnamiger Einträge
            // sowohl gegenüber der DB als auch innerhalb desselben Imports (noch ungespeicherte Zeilen).
            // Per ToListAsync + GroupBy statt ToDictionaryAsync, da der Bestand bereits mehrdeutige
            // (Rank+)Name-Kombinationen enthalten kann (z.B. doppelt angelegte Taxonomien/Sammlungen/
            // Fundorte); ToDictionaryAsync würde dabei mit "duplicate key" abbrechen. Bei Duplikaten
            // wird der erste Treffer wiederverwendet.
            var taxCache = (await _context.Taxonomies.ToListAsync())
                .GroupBy(t => $"{t.Rank}|{t.Name}".ToLowerInvariant())
                .ToDictionary(g => g.Key, g => g.First());
            var collCache = (await _context.Collections.ToListAsync())
                .GroupBy(c => c.Name.ToLowerInvariant())
                .ToDictionary(g => g.Key, g => g.First());
            var locCache = (await _context.GeoLocations.ToListAsync())
                .GroupBy(g => g.Name.ToLowerInvariant())
                .ToDictionary(g => g.Key, g => g.First());

            var errors = new List<string>();
            int imported = 0;

            for (int r = 1; r < rows.Count; r++)
            {
                var row = rows[r];
                var lineNo = r + 1; // 1-basiert, +1 wegen Header
                if (row.Length == 1 && string.IsNullOrWhiteSpace(row[0])) continue; // leere Zeile

                var name = Get(row, "Name");
                if (string.IsNullOrWhiteSpace(name))
                {
                    errors.Add($"Zeile {lineNo}: Name fehlt, Zeile übersprungen.");
                    continue;
                }

                DateOnly? findDate = null;
                var dateStr = Get(row, "Funddatum");
                if (dateStr != null)
                {
                    if (DateOnly.TryParse(dateStr, CultureInfo.InvariantCulture, DateTimeStyles.None, out var d))
                        findDate = d;
                    else
                        errors.Add($"Zeile {lineNo}: Funddatum '{dateStr}' ungültig, wird ignoriert.");
                }

                decimal? ParseDecimal(string? s, string field)
                {
                    if (s == null) return null;
                    if (decimal.TryParse(s, NumberStyles.Any, CultureInfo.InvariantCulture, out var v)) return v;
                    errors.Add($"Zeile {lineNo}: {field} '{s}' ungültig, wird ignoriert.");
                    return null;
                }

                var bodyMass = ParseDecimal(Get(row, "Koerpermasse_g"), "Koerpermasse_g");
                var bodyLength = ParseDecimal(Get(row, "Koerperlaenge_mm"), "Koerperlaenge_mm");

                // Taxonomie: erste befüllte Rang-Spalte (Art/Gattung/...) gewinnt
                Taxonomy? taxonomy = null;
                foreach (var rank in TaxonomyRankColumns)
                {
                    var taxName = Get(row, rank);
                    if (taxName == null) continue;

                    var key = $"{rank}|{taxName}".ToLowerInvariant();
                    if (!taxCache.TryGetValue(key, out taxonomy))
                    {
                        taxonomy = new Taxonomy { Name = taxName, Rank = rank, IsApproved = true };
                        _context.Taxonomies.Add(taxonomy);
                        taxCache[key] = taxonomy;
                    }
                    break;
                }

                // Sammlung: find-or-create nach Name
                Collection? collection = null;
                var collName = Get(row, "Sammlung");
                if (collName != null)
                {
                    var key = collName.ToLowerInvariant();
                    if (!collCache.TryGetValue(key, out collection))
                    {
                        collection = new Collection { Name = collName, UserId = importer.Id, IsPublic = false };
                        _context.Collections.Add(collection);
                        collCache[key] = collection;
                    }
                }

                // Fundort: find-or-create nach Name (CSV enthält keine Koordinaten)
                GeoLocation? location = null;
                var locName = Get(row, "Fundort");
                if (locName != null)
                {
                    var key = locName.ToLowerInvariant();
                    if (!locCache.TryGetValue(key, out location))
                    {
                        location = new GeoLocation { Name = locName };
                        _context.GeoLocations.Add(location);
                        locCache[key] = location;
                    }
                }

                var item = new CollectItem
                {
                    Name = name,
                    Status = Get(row, "Status") ?? "ausstehend",
                    Sex = Get(row, "Geschlecht"),
                    AgeClass = Get(row, "Altersklasse"),
                    FindDate = findDate,
                    BodyMassGram = bodyMass,
                    BodyLengthMm = bodyLength,
                    Description = Get(row, "Beschreibung"),
                    StorageInfo = Get(row, "Aufbewahrungsort"),
                    Taxonomy = taxonomy,
                    Collection = collection,
                    FindingLocation = location,
                    CreatedAt = DateTime.UtcNow,
                    CreatedByUserId = importer.Id
                };

                _context.CollectItems.Add(item);
                imported++;
            }

            await _context.SaveChangesAsync();

            return Ok(new { imported, skipped = errors.Count, errors });
        }

        // Zerlegt CSV-Text (RFC 4180) in Zeilen/Felder: erkennt in Anführungszeichen gesetzte Felder
        // mit eingebetteten Kommas, Zeilenumbrüchen und verdoppelten Anführungszeichen (Gegenstück
        // zur Esc-Funktion in ExportCsv oben).
        private static List<string[]> ParseCsv(string content)
        {
            var rows = new List<string[]>();
            var fields = new List<string>();
            var field = new StringBuilder();
            bool inQuotes = false;
            int i = 0;
            int n = content.Length;

            void EndField() { fields.Add(field.ToString()); field.Clear(); }
            void EndRow() { EndField(); rows.Add(fields.ToArray()); fields.Clear(); }

            while (i < n)
            {
                var ch = content[i];

                if (inQuotes)
                {
                    if (ch == '"')
                    {
                        if (i + 1 < n && content[i + 1] == '"') { field.Append('"'); i += 2; continue; }
                        inQuotes = false;
                        i++;
                        continue;
                    }
                    field.Append(ch);
                    i++;
                    continue;
                }

                switch (ch)
                {
                    case '"':
                        inQuotes = true;
                        i++;
                        break;
                    case ',':
                        EndField();
                        i++;
                        break;
                    case '\r':
                        i++;
                        break;
                    case '\n':
                        EndRow();
                        i++;
                        break;
                    default:
                        field.Append(ch);
                        i++;
                        break;
                }
            }

            // letzte Zeile ohne abschließenden Zeilenumbruch
            if (field.Length > 0 || fields.Count > 0) EndRow();

            return rows;
        }

        //FindDate = c.FindDate.HasValue ? c.FindDate.Value.ToDateTime(TimeOnly.MinValue).ToString("yyyy-MM-dd") : null
        // POST /api/animals — legt ein Fundobjekt an (z.B. aus der Sammlungs-Detailansicht). Koordinaten
        // sind optional (für Nutzer, die statt der Kartenansicht lieber Koordinaten von Hand eintragen
        // möchten): werden sie mitgeschickt, entsteht wie bei CreateMapAnimal ein Fundort, wodurch das
        // Tier zusätzlich auf der Kartenansicht erscheint.
        [HttpPost]
        [AllowAnonymous]
        public async Task<ActionResult<CollectItem>> CreateAnimal(CreateAnimalDto dto)
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser == null)
            {
                return Unauthorized();
            }

            if (string.IsNullOrWhiteSpace(dto.Name))
            {
                return BadRequest("Name fehlt");
            }

            // Sammlung ist Pflicht und der Nutzer darf Tiere nur in seine EIGENE Sammlung anlegen
            // (Admin ausgenommen). Moderatoren dürfen ausdrücklich NICHT in fremden Sammlungen anlegen.
            if (!dto.CollectionId.HasValue)
            {
                return BadRequest("Sammlung ist erforderlich");
            }

            var collection = await _context.Collections
                .FirstOrDefaultAsync(c => c.Id == dto.CollectionId.Value);

            if (collection == null)
            {
                return BadRequest("Collection existiert nicht");
            }

            if (!CanManageCollection(currentUser, collection))
            {
                return Forbid();
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

            int? findingLocationId = null;

            if (dto.Latitude.HasValue && dto.Longitude.HasValue)
            {
                if (dto.Latitude < -90 || dto.Latitude > 90)
                {
                    return BadRequest("Latitude zwischen -90 und 90.");
                }

                if (dto.Longitude < -180 || dto.Longitude > 180)
                {
                    return BadRequest("Longitude zwischen -180 und 180.");
                }

                var location = await GetOrCreateLocationAsync(dto.Latitude.Value, dto.Longitude.Value, dto.LocationName);
                findingLocationId = location.Id;
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
                FindingLocationId = findingLocationId,
                FindDate = dto.FindDate,
                Description = dto.Description,
                Lebensraum = dto.Lebensraum,
                StorageInfo = dto.StorageInfo,
                Status = dto.Status,
                CreatedByUserId = currentUser?.Id,
            };

            _context.CollectItems.Add(item);
            await _context.SaveChangesAsync();
            return CreatedAtAction(nameof(GetAnimal), new { id = item.Id }, item);
        }

        // Verwaltungsrecht für eine Sammlung (Tiere anlegen/bearbeiten): nur der Eigentümer der
        // Sammlung oder ein Admin. Moderatoren dürfen fremde Sammlungen ausdrücklich NICHT verwalten
        // (nur ihre eigenen). Grundlage für das Anlegen von Tieren (CreateAnimal/CreateMapAnimal).
        private static bool CanManageCollection(User user, Collection collection)
        {
            return user.Role == "Admin" || collection.UserId == user.Id;
        }

        // Bearbeitungsrecht für ein bestehendes Fundobjekt: nur der Eigentümer der zugehörigen Sammlung
        // oder ein Admin (Moderatoren dürfen fremde Sammlungen nicht bearbeiten). Setzt voraus, dass
        // item.Collection geladen ist. Objekte ohne Sammlung sind nur für Admins bearbeitbar.
        private static bool CanEditItem(User user, CollectItem item)
        {
            return user.Role == "Admin" || (item.Collection != null && item.Collection.UserId == user.Id);
        }

        // Löschrecht für ein Fundobjekt: Admin/Moderator (Moderationsfunktion) oder der Nutzer, der den
        // Eintrag angelegt hat (CreatedByUserId). Bewusst getrennt vom Bearbeitungsrecht — das Löschen
        // als Moderationsmaßnahme bleibt Moderatoren erhalten, das Bearbeiten fremder Sammlungen nicht.
        private static bool CanDeleteItem(User user, CollectItem item)
        {
            var isModerator = user.Role == "Admin" || user.Role == "Moderator";
            var isCreator = item.CreatedByUserId.HasValue && item.CreatedByUserId == user.Id;
            return isModerator || isCreator;
        }

        // Sucht einen bestehenden Fundort mit identischem Namen + Koordinaten oder legt einen neuen an
        // (verhindert Duplikate für denselben Ort). Gemeinsam genutzt von CreateAnimal (optionale
        // Koordinaten) und CreateMapAnimal (Koordinaten aus Kartenklick).
        private async Task<GeoLocation> GetOrCreateLocationAsync(decimal latitude, decimal longitude, string? locationName)
        {
            var name = string.IsNullOrWhiteSpace(locationName) ? "Unbekannter Fundort" : locationName;

            var location = await _context.GeoLocations
                .FirstOrDefaultAsync(g => g.Name == name && g.Latitude == latitude && g.Longitude == longitude);

            if (location == null)
            {
                location = new GeoLocation { Name = name, Latitude = latitude, Longitude = longitude };
                _context.GeoLocations.Add(location);
                await _context.SaveChangesAsync();
            }

            return location;
        }

        // POST /api/animals/map — legt ein Fundobjekt über die Kartenansicht an: validiert Koordinaten
        // und Fremdschlüssel (Collection/Taxonomy) und erstellt bei Bedarf einen neuen Fundort (GeoLocation).
        [HttpPost("map")]
        [AllowAnonymous]
        public async Task<ActionResult<CollectItem>> CreateMapAnimal(CreateMapAnimalDto dto)
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser == null)
            {
                return Unauthorized();
            }

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

            // Sammlung ist beim Anlegen über die Karte Pflicht: jedes Tier muss einer
            // (eigenen) Sammlung zugeordnet sein, sonst wird es nicht gespeichert.
            if (!dto.CollectionId.HasValue)
            {
                return BadRequest("Sammlung ist erforderlich");
            }

            var collection = await _context.Collections
                .FirstOrDefaultAsync(c => c.Id == dto.CollectionId.Value);

            if (collection == null)
            {
                return BadRequest("Collection existiert nicht");
            }

            // Der Nutzer darf Tiere nur in seine EIGENE Sammlung einordnen (Admin ausgenommen).
            // Moderatoren dürfen ausdrücklich NICHT in fremden Sammlungen anlegen.
            if (!CanManageCollection(currentUser, collection))
            {
                return Forbid();
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

            var location = await GetOrCreateLocationAsync(dto.Latitude, dto.Longitude, dto.LocationName);

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
                Lebensraum = dto.Lebensraum,
                // Ohne explizite Statusangabe startet jedes neue Fundobjekt als "ausstehend" (Moderationsworkflow)
                Status = string.IsNullOrWhiteSpace(dto.Status) ? "ausstehend" : dto.Status,
                CreatedByUserId = currentUser?.Id,
            };

            _context.CollectItems.Add(item);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetAnimal), new { id = item.Id }, item);
        }

        // PUT /api/animals/{id} — bearbeitet ein bestehendes Fundobjekt (Stammdaten + Taxonomie +
        // optionale Koordinaten). Bearbeiten darf nur der Eigentümer der zugehörigen Sammlung oder ein
        // Admin (siehe CanEditItem) — Moderatoren dürfen fremde Sammlungen ausdrücklich NICHT bearbeiten.
        // Koordinaten werden wie bei CreateAnimal/CreateMapAnimal über GetOrCreateLocationAsync
        // aufgelöst statt einen evtl. von anderen Objekten geteilten Fundort direkt zu verändern;
        // werden beide Koordinaten weggelassen, verliert das Objekt seinen Fundort.
        [HttpPut("{id}")]
        [AllowAnonymous]
        public async Task<ActionResult<object>> UpdateAnimal(int id, UpdateAnimalDto dto)
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser == null)
            {
                return Unauthorized();
            }

            var item = await _context.CollectItems
                .Include(i => i.Collection)
                .FirstOrDefaultAsync(i => i.Id == id);
            if (item == null)
            {
                return NotFound();
            }

            if (!CanEditItem(currentUser, item))
            {
                return Forbid();
            }

            if (string.IsNullOrWhiteSpace(dto.Name))
            {
                return BadRequest("Name fehlt");
            }

            if (dto.TaxonomyId.HasValue)
            {
                var taxonomyExists = await _context.Taxonomies.AnyAsync(t => t.Id == dto.TaxonomyId.Value);
                if (!taxonomyExists)
                {
                    return BadRequest("Taxonomy existiert nicht");
                }
            }

            int? findingLocationId = null;

            if (dto.Latitude.HasValue && dto.Longitude.HasValue)
            {
                if (dto.Latitude < -90 || dto.Latitude > 90)
                {
                    return BadRequest("Latitude zwischen -90 und 90.");
                }

                if (dto.Longitude < -180 || dto.Longitude > 180)
                {
                    return BadRequest("Longitude zwischen -180 und 180.");
                }

                var location = await GetOrCreateLocationAsync(dto.Latitude.Value, dto.Longitude.Value, dto.LocationName);
                findingLocationId = location.Id;
            }

            item.Name = dto.Name;
            item.Sex = dto.Sex;
            item.AgeClass = dto.AgeClass;
            item.BodyMassGram = dto.BodyMassGram;
            item.BodyLengthMm = dto.BodyLengthMm;
            item.TaxonomyId = dto.TaxonomyId;
            item.FindingLocationId = findingLocationId;
            item.FindDate = dto.FindDate;
            item.Description = dto.Description;
            item.Lebensraum = dto.Lebensraum;
            item.StorageInfo = dto.StorageInfo;
            item.Status = dto.Status;

            await _context.SaveChangesAsync();

            return await GetAnimal(id);
        }

        // DELETE /api/animals/{id} — löscht ein einzelnes Fundobjekt (samt abhängiger Bilder/Ausleihen
        // per DB-Cascade); nur Admin/Moderator oder der Nutzer, der den Eintrag angelegt hat, dürfen löschen.
        [HttpDelete("{id}")]
        [AllowAnonymous]
        public async Task<IActionResult> DeleteAnimal(int id)
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser == null)
            {
                return Unauthorized();
            }

            var item = await _context.CollectItems.FindAsync(id);
            if (item == null)
            {
                return NotFound();
            }

            if (!CanDeleteItem(currentUser, item))
            {
                return Forbid();
            }

            _context.CollectItems.Remove(item);
            await _context.SaveChangesAsync();

            return NoContent();
        }

        // Ermittelt den aktuell angemeldeten Nutzer aus dem Request (Clerk-Header oder JWT sub-Claim);
        // gibt null zurück, wenn kein Nutzer identifiziert werden kann (z.B. bei anonymen Anfragen).
        private async Task<User?> GetCurrentUserAsync()
        {
            var clerkId = Request.Headers["X-Clerk-User-Id"].FirstOrDefault();

            if (string.IsNullOrWhiteSpace(clerkId))
                clerkId = User.FindFirst("sub")?.Value;

            if (string.IsNullOrWhiteSpace(clerkId))
                return null;

            var user = await _context.Users
                .FirstOrDefaultAsync(u => u.ClerkId == clerkId);
            if (user != null)
                return user;

            // Normalerweise legt der Clerk-Webhook (ClerkWebhookController) den Nutzer bei der
            // Registrierung an; ist der Webhook nicht erreichbar (z.B. lokale Entwicklung ohne
            // gültigen Tunnel), fehlt der Nutzer hier sonst dauerhaft. Fallback: direkt bei Clerk nachschlagen.
            return await _userProvisioning.ProvisionFromClerkAsync(clerkId);
        }
    }
}
