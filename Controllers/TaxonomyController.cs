using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TodoApi.Models;
using TodoApi.DTOs;
using System.Net.Http.Json;

namespace TodoApi.Controllers
{
    /// <summary>
    /// Verwaltet die Taxonomie-Hierarchie (Reich/Stamm/Klasse/Ordnung/Familie/Gattung/Art) sowie
    /// den Workflow für neue Taxonomie-Vorschläge (TaxonomySubmissions). Neue Taxonomien können
    /// entweder automatisch über die GBIF-API (externe Taxonomie-Datenbank) abgeglichen und übernommen
    /// werden, oder manuell von Nutzern eingereicht werden und müssen dann von einem Moderator/Admin
    /// geprüft (approve/reject) werden, bevor sie in der Haupttabelle "Taxonomies" landen.
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    public class TaxonomyController : ControllerBase
    {
        private readonly NeondbContext _context;
        private readonly IHttpClientFactory _httpClientFactory;

        public TaxonomyController(NeondbContext context, IHttpClientFactory httpClientFactory)
        {
            _context = context;
            _httpClientFactory = httpClientFactory;
        }

        // Prüft, ob GBIF für ein Taxon alle benötigten Rangstufen zwischen Stamm und Art geliefert hat.
        // Fehlt eine Ebene, ist die Taxonomie-Kette unvollständig und darf nicht automatisch übernommen werden.
        private static bool HasCompleteAnimalTaxonomy(GbifSpeciesDto gbif)
        {
            return !string.IsNullOrWhiteSpace(gbif.Phylum)
                && !string.IsNullOrWhiteSpace(gbif.ClassName)
                && !string.IsNullOrWhiteSpace(gbif.Order)
                && !string.IsNullOrWhiteSpace(gbif.Family)
                && !string.IsNullOrWhiteSpace(gbif.Genus)
                && !string.IsNullOrWhiteSpace(gbif.Species ?? gbif.CanonicalName ?? gbif.ScientificName);
        }

        // Legt (bzw. findet) die komplette Taxonomie-Kette für ein von GBIF geliefertes Taxon an,
        // indem die GBIF-Felder auf die interne Rangkette (Stamm...Art) gemappt werden.
        private async Task<Taxonomy> CreateChainFromGbifAsync(GbifSpeciesDto gbif)
        {
            if (!HasCompleteAnimalTaxonomy(gbif))
                throw new InvalidOperationException("GBIF liefert keine vollständige Taxonomie.");

            return await GetOrCreateTaxonomyChainAsync(
                gbif.Phylum!,
                gbif.ClassName!,
                gbif.Order!,
                gbif.Family!,
                gbif.Genus!,
                gbif.Species ?? gbif.CanonicalName ?? gbif.ScientificName!
            );
        }

        // GET /api/taxonomy — listet alle Taxonomie-Einträge (alle Rangstufen, flach, mit ParentId)
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

        // Baut die gesamte Taxonomie-Kette von Stamm bis Art unterhalb von "Animalia" auf.
        // Für jede Rangstufe wird geprüft, ob unter dem jeweiligen Parent bereits ein Eintrag mit
        // gleichem Namen existiert (Wiederverwendung); fehlt er, wird er neu angelegt und direkt
        // als "genehmigt" markiert (IsApproved = true), da diese Kette entweder aus einer bereits
        // geprüften GBIF-Quelle oder einer soeben freigegebenen Submission stammt.
        // Gibt am Ende den Blattknoten (die Art) zurück.
        private async Task<Taxonomy> GetOrCreateTaxonomyChainAsync(string stamm,
                                                                    string klasse,
                                                                    string ordnung,
                                                                    string familie,
                                                                    string gattung,
                                                                    string art)
        {
            var animalia = await _context.Taxonomies
                .FirstOrDefaultAsync(t => t.Name == "Animalia" && t.Rank == "Reich");

            if (animalia == null)
                throw new InvalidOperationException("Animalia ist nicht in der Datenbank vorhanden.");

            var chain = new List<(string Rank, string Name)>
            {
                ("Stamm", stamm.Trim()),
                ("Klasse", klasse.Trim()),
                ("Ordnung", ordnung.Trim()),
                ("Familie", familie.Trim()),
                ("Gattung", gattung.Trim()),
                ("Art", art.Trim())
            };

            Taxonomy parent = animalia;

            foreach (var item in chain)
            {
                var existing = await _context.Taxonomies
                    .FirstOrDefaultAsync(t =>
                        t.Name == item.Name &&
                        t.Rank == item.Rank &&
                        t.ParentId == parent.Id);

                if (existing == null)
                {
                    existing = new Taxonomy
                    {
                        Name = item.Name,
                        Rank = item.Rank,
                        ParentId = parent.Id,
                        IsApproved = true
                    };

                    _context.Taxonomies.Add(existing);
                    await _context.SaveChangesAsync();
                }

                parent = existing;
            }

            return parent;
        }

        // GET /api/taxonomy/{id} — Detailansicht eines einzelnen Taxonomie-Eintrags
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

        // POST /api/taxonomy — legt einen einzelnen Taxonomie-Eintrag direkt an (z.B. für Admin-Tools);
        // wird zunächst als nicht genehmigt (IsApproved = false) angelegt
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

        // GET /api/taxonomy/gbif — wird aufgerufen, wenn der Nutzer einen Artnamen eingibt.
        // Fragt die GBIF-API nach einer eindeutigen Übereinstimmung (species/match). Nur bei hoher
        // Konfidenz (>= 90), eindeutigem Treffer und vollständiger Taxonomie-Kette gilt der Treffer
        // als "sicher" und kann automatisch übernommen werden; ansonsten werden per species/suggest
        // bis zu 5 Vorschläge zur manuellen Bestätigung durch den Nutzer geliefert.
        [HttpGet("gbif")]
        public async Task<ActionResult<object>> PreviewFromGbif([FromQuery] GbifLookupDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.SpeciesName))
                return BadRequest("Artname ist erforderlich.");

            var client = _httpClientFactory.CreateClient("Gbif");

            var speciesName = dto.SpeciesName.Trim();

            var matchUrl =
                $"species/match?name={Uri.EscapeDataString(speciesName)}&kingdom=Animalia&rank=SPECIES&verbose=true";

            var gbif = await client.GetFromJsonAsync<GbifSpeciesDto>(matchUrl);

            // "Sicherer" Treffer nur, wenn GBIF ein eindeutiges Taxon mit hoher Konfidenz liefert
            // und alle benötigten Rangstufen vorhanden sind — sonst besteht das Risiko einer falschen
            // automatischen Zuordnung und der Nutzer muss manuell bestätigen.
            var isSafeMatch =
                gbif != null &&
                gbif.UsageKey.HasValue &&
                gbif.MatchType != "NONE" &&
                gbif.Confidence >= 90 &&
                HasCompleteAnimalTaxonomy(gbif);

            if (isSafeMatch)
            {

                return Ok(new
                {
                    status = "match_found",
                    UsageKey = gbif!.UsageKey,
                    input = speciesName,
                    confidence = gbif.Confidence,
                    scientificName = gbif.ScientificName,
                    canonicalName = gbif.CanonicalName,

                    taxonomy = new
                    {
                        reich = gbif.Kingdom,
                        stamm = gbif.Phylum,
                        klasse = gbif.ClassName,
                        ordnung = gbif.Order,
                        familie = gbif.Family,
                        gattung = gbif.Genus,
                        art = gbif.Species ?? gbif.CanonicalName ?? gbif.ScientificName
                    }
                });
            }

            var suggestUrl =
                $"species/suggest?q={Uri.EscapeDataString(speciesName)}&rank=SPECIES&limit=5";

            var suggestions = await client.GetFromJsonAsync<List<GbifSpeciesDto>>(suggestUrl)
                ?? new List<GbifSpeciesDto>();

            return Ok(new
            {
                status = "needs_confirmation",
                message = "Keine sichere GBIF-Übereinstimmung gefunden.",
                input = speciesName,
                gbifMatch = gbif,
                suggestions = suggestions.Select(s => new
                {
                    usageKey = s.Key ?? s.UsageKey,
                    s.ScientificName,
                    s.CanonicalName,
                    s.Rank,
                    s.Status,
                    s.Kingdom,
                    s.Phylum,
                    className = s.ClassName,
                    s.Order,
                    s.Family,
                    s.Genus,
                    s.Species
                })
            });
        }

        // POST /api/taxonomy/gbif/confirm — wird aufgerufen, wenn der Nutzer einen der Vorschläge
        // aus PreviewFromGbif manuell bestätigt. Lädt das Taxon per GBIF UsageKey, prüft, dass es zu
        // Animalia gehört und Rang "Art" hat, und legt anschließend die komplette Taxonomie-Kette an.
        [HttpPost("gbif/confirm")]
        public async Task<ActionResult<object>> ConfirmGbifTaxonomy(ConfirmGbifTaxonomyDto dto)
        {
            if (dto.UsageKey <= 0)
                return BadRequest("GBIF UsageKey ist erforderlich.");

            var client = _httpClientFactory.CreateClient("Gbif");

            var gbif = await client.GetFromJsonAsync<GbifSpeciesDto>($"species/{dto.UsageKey}");

            if (gbif == null)
                return NotFound("GBIF-Taxon wurde nicht gefunden.");

            if (!string.Equals(gbif.Kingdom, "Animalia", StringComparison.OrdinalIgnoreCase))
                return BadRequest("Das ausgewählte Taxon gehört nicht zu Animalia.");

            if (!string.Equals(gbif.Rank, "SPECIES", StringComparison.OrdinalIgnoreCase))
                return BadRequest("Das ausgewählte Taxon ist keine Art.");

            var species = await CreateChainFromGbifAsync(gbif);

            return Ok(new
            {
                status = "created",
                taxonomyId = species.Id,
                gbifUsageKey = dto.UsageKey,
                scientificName = gbif.ScientificName,
                canonicalName = gbif.CanonicalName
            });
        }

        // POST /api/taxonomy/submissions — für manuelle Taxonomie-Einträge, wenn GBIF keinen sicheren
        // Treffer liefert. Erfordert Anmeldung; landet zunächst als "pending" in der Submissions-Tabelle
        // und muss von einem Moderator/Admin geprüft werden (siehe Approve/Reject unten).
        [HttpPost("submissions")]
        [Authorize]
        public async Task<ActionResult<object>> CreateTaxonomySubmission(CreateTaxonomySubmissionDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Stamm) ||
                string.IsNullOrWhiteSpace(dto.Klasse) ||
                string.IsNullOrWhiteSpace(dto.Ordnung) ||
                string.IsNullOrWhiteSpace(dto.Familie) ||
                string.IsNullOrWhiteSpace(dto.Gattung) ||
                string.IsNullOrWhiteSpace(dto.Art))
            {
                return BadRequest("Alle Taxonomie-Felder sind erforderlich.");
            }

            var clerkId = User.FindFirst("sub")?.Value;
            int? createdBy = null;
            if (!string.IsNullOrWhiteSpace(clerkId))
            {
                var user = await _context.Users.FirstOrDefaultAsync(u => u.ClerkId == clerkId && u.DeletedAt == null);
                createdBy = user?.Id;
            }

            var submission = new TaxonomySubmission
            {
                Reich = "Animalia",
                Stamm = dto.Stamm.Trim(),
                Klasse = dto.Klasse.Trim(),
                Ordnung = dto.Ordnung.Trim(),
                Familie = dto.Familie.Trim(),
                Gattung = dto.Gattung.Trim(),
                Art = dto.Art.Trim(),
                Source = "manual",
                Status = "pending",
                CreatedAt = DateTime.UtcNow,
                CreatedBy = createdBy
            };

            _context.TaxonomySubmissions.Add(submission);
            await _context.SaveChangesAsync();

            return Ok(new
            {
                submission.Id,
                submission.Status,
                submission.Art
            });
        }

        // GET /api/taxonomy/submissions/my — eigene Einreichungen des angemeldeten Nutzers
        // inkl. Status und Ablehnungsgrund (ModeratorNote)
        [HttpGet("submissions/my")]
        [Authorize]
        public async Task<ActionResult<object>> GetMySubmissions()
        {
            var clerkId = User.FindFirst("sub")?.Value;
            if (string.IsNullOrWhiteSpace(clerkId)) return Unauthorized();

            var user = await _context.Users.FirstOrDefaultAsync(u => u.ClerkId == clerkId && u.DeletedAt == null);
            if (user == null) return NotFound();

            var submissions = await _context.TaxonomySubmissions
                .Where(s => s.CreatedBy == user.Id)
                .OrderByDescending(s => s.ReviewedAt ?? s.CreatedAt)
                .Select(s => new
                {
                    s.Id,
                    s.Art,
                    s.Gattung,
                    s.Familie,
                    s.Status,
                    s.ModeratorNote,
                    s.CreatedAt,
                    s.ReviewedAt
                })
                .ToListAsync();

            return Ok(submissions);
        }

        // GET /api/taxonomy/submissions/pending — offene Einreichungen, die ein Moderator/Admin
        // noch prüfen (freigeben oder ablehnen) muss.
        // WICHTIG: aktuell fehlt hier noch eine [Authorize]/Rollenprüfung — später auf reine
        // Moderator/Admin-Ansicht beschränken! (bestehendes TODO, siehe Kommentar im Original)
        [HttpGet("submissions/pending")]
        public async Task<ActionResult<object>> GetPendingTaxonomySubmissions()
        {
            var submissions = await _context.TaxonomySubmissions
                .Where(s => s.Status == "pending")
                .OrderBy(s => s.CreatedAt)
                .Select(s => new
                {
                    s.Id,
                    s.Reich,
                    s.Stamm,
                    s.Klasse,
                    s.Ordnung,
                    s.Familie,
                    s.Gattung,
                    s.Art,
                    s.Source,
                    s.Status,
                    s.CreatedAt
                })
                .ToListAsync();

            return Ok(submissions);
        }

        // POST /api/taxonomy/submissions/{id}/approve — genehmigt eine Einreichung: baut die
        // Taxonomie-Kette in der Haupttabelle auf (bzw. verwendet vorhandene Einträge) und markiert
        // die Submission als "approved". Nur einmalig möglich (Status muss "pending" sein).
        [HttpPost("submissions/{id}/approve")]
        public async Task<ActionResult<object>> ApproveTaxonomySubmission(int id,
                                                                        ReviewTaxonomySubmissionDto dto)
        {
            var submission = await _context.TaxonomySubmissions
                .FirstOrDefaultAsync(s => s.Id == id);

            if (submission == null)
                return NotFound();

            if (submission.Status != "pending")
                return BadRequest("Dieser Vorschlag wurde bereits bearbeitet.");

            var species = await GetOrCreateTaxonomyChainAsync(
                submission.Stamm,
                submission.Klasse,
                submission.Ordnung,
                submission.Familie,
                submission.Gattung,
                submission.Art
            );

            submission.Status = "approved";
            submission.ModeratorNote = dto.ModeratorNote;
            submission.ReviewedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();

            return Ok(new
            {
                status = submission.Status,
                taxonomyId = species.Id,
                submission.Id
            });
        }

        // DELETE /api/taxonomy/{id} — löscht einen Taxonomie-Eintrag (typischerweise Moderator/Admin-Funktion).
        // Schutzregeln: das Wurzel-Reich "Animalia" darf nie gelöscht werden, ebenso wenig Einträge,
        // die noch untergeordnete Taxonomie-Einträge oder zugeordnete Fundobjekte (CollectItems) haben —
        // sonst würden Referenzen ins Leere zeigen bzw. eine ganze Teilhierarchie verwaist.
        [HttpDelete("{id}")]
        public async Task<ActionResult> DeleteTaxonomy(int id)
        {
            var taxonomy = await _context.Taxonomies.FindAsync(id);
            if (taxonomy == null) return NotFound();

            if (taxonomy.Name == "Animalia" && taxonomy.Rank == "Reich")
                return BadRequest("Das Reich Animalia kann nicht gelöscht werden.");

            var hasChildren = await _context.Taxonomies.AnyAsync(t => t.ParentId == id);
            if (hasChildren)
                return BadRequest("Dieser Eintrag hat untergeordnete Einträge. Bitte zuerst diese löschen.");

            var hasItems = await _context.CollectItems.AnyAsync(a => a.TaxonomyId == id);
            if (hasItems)
                return BadRequest("Diesem Eintrag sind Objekte zugeordnet und kann nicht gelöscht werden.");

            _context.Taxonomies.Remove(taxonomy);
            await _context.SaveChangesAsync();
            return NoContent();
        }

        // POST /api/taxonomy/submissions/{id}/reject — lehnt eine Einreichung ab. Abgelehnte
        // Submissions bleiben (mit Status "rejected" und optionaler Begründung) in der
        // Submissions-Tabelle erhalten, werden aber nicht in die Haupttabelle "Taxonomies" übernommen.
        [HttpPost("submissions/{id}/reject")]
        public async Task<ActionResult<object>> RejectTaxonomySubmission(int id,
                                                                        ReviewTaxonomySubmissionDto dto)
        {
            var submission = await _context.TaxonomySubmissions
                .FirstOrDefaultAsync(s => s.Id == id);

            if (submission == null)
                return NotFound();

            if (submission.Status != "pending")
                return BadRequest("Dieser Vorschlag wurde bereits bearbeitet.");

            submission.Status = "rejected";
            submission.ModeratorNote = dto.ModeratorNote;
            submission.ReviewedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();

            return Ok(new
            {
                status = submission.Status,
                submission.Id
            });
        }

    }
}