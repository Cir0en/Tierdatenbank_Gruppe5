using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using System.Collections.ObjectModel;
using Tierapp.DTOs;
using Tierapp.Services;

namespace Tierapp.ViewModels;

public partial class SammlungDetailsViewModel : ObservableObject
{
    private readonly ApiService _apiService;

    public SammlungDetailsViewModel(ApiService apiService)
    {
        _apiService = apiService;
    }

    [ObservableProperty]
    private CollectionDetailDto _collectionDetails;

    [ObservableProperty]
    public partial bool IsBusy { get; set; }

    [RelayCommand]
    public async Task LoadCollectionDetailsAsync(int collectionId)
    {
        if (IsBusy) return;

        try
        {
            IsBusy = true;
            var data = await _apiService.GetCollectionDetailsAsync(collectionId);
            Console.WriteLine($"Loaded collection details for ID {collectionId} from API.");

            CollectionDetails = data;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error loading collection details: {ex.Message}");
        }
        finally
        {
            IsBusy = false;
        }
    }

    [RelayCommand]
    public async Task NavigateToAnimalDetailsAsync(int animalId)
    {
        // Hier die Navigation zu den Tierdetails implementieren
        // Zum Beispiel:
        await Shell.Current.GoToAsync($"AnimalDetail?animalId={animalId}");
        Console.WriteLine($"Navigating to animal details for ID {animalId}.");
    }
}

