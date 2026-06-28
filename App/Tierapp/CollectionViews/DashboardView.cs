using LocalizationResourceManager.Maui;
using System.Globalization;
using CommunityToolkit.Mvvm.Input;
using Tierapp.DTOs;
using Tierapp.Services;
using CommunityToolkit.Mvvm.ComponentModel;

namespace Tierapp.ViewModels;

public partial class DashboardViewModel : ObservableObject
{
    private readonly ApiService _apiService;

    // Wir lassen uns das Interface injizieren
    public DashboardViewModel(ApiService apiService)
    {
        _apiService = apiService;
    }

    [ObservableProperty]
    public partial ObservableCollection<CollectionListDto> Collections { get; set; }= new();
    
    [ObservableProperty]
    public partial ObservableCollection<AnimalListDto> Animals { get; set; }= new();

    [ObservableProperty]
    public partial bool IsBusy { get; set; }

    [RelayCommand]
    public async Task LoadDataAsync()
    {
        // Hier könntest du deine API-Aufrufe machen, um die Daten für das Dashboard zu laden
        // Zum Beispiel:
        // var data = await _apiService.GetDashboardDataAsync();
        // Und dann die Daten in ObservableProperties speichern, damit das UI aktualisiert wird

        if (IsBusy) return;

        try
        {
            IsBusy = true;
            var collections = await Task.Run(async () => await _apiService.GetMyCollectionsAsync());
            var animals = await Task.Run(async () => await _apiService.GetMyAnimalsAsync());
            Console.WriteLine($"Loaded {collections.Count} collections and {animals.Count} animals from API.");

            // Erzwinge die UI-Aktualisierung im Main-Thread
            await MainThread.InvokeOnMainThreadAsync(() =>
            {
                Collections.Clear();
                foreach (var item in collections)
                {
                    Collections.Add(item);
                }
            });


        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error loading collections: {ex.Message}");
        }
        finally
        {
            IsBusy = false;
        }
    }
}


