namespace Tierapp.DTOs;

public class AnimalListDto
{
    public int Id { get; set; }
    public string? Name { get; set; }
    public DateOnly? FindDate { get; set; }
    public string? Status { get; set; }
}