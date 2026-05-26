namespace TodoApi.DTOs;

public class CollectionItemDto
{
    public int Id { get; set; }
    public string? Name { get; set; }
    public DateOnly? FindDate { get; set; }
    public string? Status { get; set; }
}