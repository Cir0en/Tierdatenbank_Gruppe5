using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using System.Collections.ObjectModel;
using Tierapp.DTOs;
using Tierapp.Services;

namespace Tierapp.ViewModels;

public partial class AnimalDetailViewModel : ObservableObject
{
    private readonly ApiService _apiService;

    public AnimalDetailViewModel(ApiService apiService)
    {
        _apiService = apiService;
    }

    [ObservableProperty]
    private CollectionItemDto _animalDetails;

    [ObservableProperty]
    public partial bool IsBusy { get; set; }

    [ObservableProperty]
    private string? animalImageUrl;

    [RelayCommand]
    public async Task LoadAnimalDetailsAsync(int animalId)
    {
        if (IsBusy) return;

        try
        {
            IsBusy = true;
            var data = await _apiService.GetAnimalDetailsAsync(animalId);
            Console.WriteLine($"Loaded animal details for ID {animalId} from API.");

            AnimalDetails = data;

            var image = await _apiService.GetAnimalImagesAsync(animalId);
            AnimalImageUrl = image?.ImageUrl ?? "default_placeholder.png"; // Fallback to placeholder if no image
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error loading animal details: {ex.Message}");
        }
        finally
        {
            IsBusy = false;
        }
    }
}