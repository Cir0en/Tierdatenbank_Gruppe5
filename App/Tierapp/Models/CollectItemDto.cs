namespace Tierapp.DTOs
{
    public class CollectItemDto
    {
        public int Id { get; set; }
        public int? CollectionId { get; set; }
        public int? TaxonomyId { get; set; }
        public string? Name { get; set; }
        public string? FindDate { get; set; }
        public string? Description { get; set; }
        public string? Status { get; set; }
    }
}
