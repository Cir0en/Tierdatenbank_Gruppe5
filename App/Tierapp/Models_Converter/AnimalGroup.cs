using Tierapp.DTOs;

namespace Tierapp.Models;

public class AnimalGroup : List<CollectionItemDto>
{
    public string Title { get; }

    public AnimalGroup(string title, List<CollectionItemDto> items) : base(items)
    {
        Title = title;
    }
}