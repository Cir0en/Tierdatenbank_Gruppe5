using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using System.Collections.ObjectModel;
using Tierapp.DTOs;
using Tierapp.Services;

namespace Tierapp.ViewModels;

// [ObservableObject] generiert automatisch den INotifyPropertyChanged-Code
public partial class SammlungsViewModel : ObservableObject
{
    private readonly ApiService _apiService;

    public SammlungsViewModel(ApiService apiService)
    {
        _apiService = apiService;

    }

    // [ObservableProperty] erstellt automatisch die "Collections"-Eigenschaft
    // und benachrichtigt das UI, wenn sich die Liste ändert.
    [ObservableProperty]
    public partial ObservableCollection<CollectionListDto> Collections { get; set; }= new();

    [ObservableProperty]
    public partial bool IsBusy { get; set; }

    // [RelayCommand] generiert den Command für deinen Button im XAML
    [RelayCommand]
    public async Task LoadCollectionsAsync()
    {
        if (IsBusy) return;

        try
        {
            IsBusy = true;
            var data = await Task.Run(async () => await _apiService.GetMyCollectionsAsync());
            Console.WriteLine($"Loaded {data.Count} collections from API.");

            // Erzwinge die UI-Aktualisierung im Main-Thread
            await MainThread.InvokeOnMainThreadAsync(() =>
            {
                Collections.Clear();
                foreach (var item in data)
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