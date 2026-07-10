using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using System.Collections.ObjectModel;
using System.Globalization;
using Tierapp.DTOs;
using Tierapp.Services;
using Tierapp.Models;
using System.Text;

namespace Tierapp.ViewModels;

public partial class SammlungDetailsViewModel : ObservableObject
{
    private readonly ApiService _apiService;

    public SammlungDetailsViewModel(ApiService apiService)
    {
        _apiService = apiService;
    }

    private List<CollectionItemDto> _allItems = new();

    [ObservableProperty]
    private CollectionDetailDto _collectionDetails;

    [ObservableProperty]
    public partial bool IsBusy { get; set; }

    [ObservableProperty]
    private ObservableCollection<CollectionItemDto> filteredItems = new();

    [ObservableProperty]
    private string searchText = string.Empty;

    partial void OnSearchTextChanged(string value)
    {
        ApplyFilter();
    }

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

            _allItems = data.Items?.ToList() ?? new List<CollectionItemDto>();
            ApplyFilter();
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

    private void ApplyFilter()
    {
        var filtered = string.IsNullOrWhiteSpace(SearchText)
            ? _allItems
            : _allItems.Where(i => i.Name != null &&
                                    i.Name.Contains(SearchText, StringComparison.OrdinalIgnoreCase)).ToList();


        FilteredItems = new ObservableCollection<CollectionItemDto>(filtered);
    }


    [RelayCommand]
    public async Task NavigateToAnimalDetailsAsync(int animalId)
    {
        // Hier die Navigation zu den Tierdetails implementieren
        // Zum Beispiel:
        await Shell.Current.GoToAsync($"AnimalDetail?animalId={animalId}");
        Console.WriteLine($"Navigating to animal details for ID {animalId}.");
    }

    [RelayCommand]
    public async Task ExportCollectionAsync()
    {
        if (CollectionDetails == null)
        {
            await Shell.Current.DisplayAlert("Export", "Keine Daten zum Exportieren vorhanden.", "OK");
            return;
        }

        try
        {
            IsBusy = true;
            var csv = BuildCsv(CollectionDetails.Items);

            var fileName = $"{CollectionDetails.Name}_export_{DateTime.Now:yyyyMMdd_HHmmss}.csv";
            var filePath = Path.Combine(FileSystem.CacheDirectory, fileName);

            await File.WriteAllTextAsync(filePath, csv, Encoding.UTF8);
            await Share.RequestAsync(new ShareFileRequest
            {
                Title = "Exportierte Sammlung",
                File = new ShareFile(filePath)
            });
            
        }
        catch (Exception ex)
        {
            await Shell.Current.DisplayAlert("Export Error", $"Fehler beim Exportieren der Sammlung: {ex.Message}", "OK");
        }
        finally
        {
            IsBusy = false;
        }
    }

    private static string BuildCsv(IEnumerable<CollectionItemDto> items)
    {
        var csvBuilder = new StringBuilder();
        csvBuilder.AppendLine("Id,Name,Species,Age,Description");

        foreach (var item in items)
        {
            csvBuilder.AppendLine($"{item.Id},{Escape(item.Name)},{Escape(item.Taxonomy?.Name)},{item.AgeClass},{Escape(item.Description)}");
        }

        return csvBuilder.ToString();
    }

    private static string Escape(string value)
    {
        if (string.IsNullOrEmpty(value)) return string.Empty;
        return value.Contains(';') || value.Contains('"')
            ? $"\"{value.Replace("\"", "\"\"")}\""
            : value;
    }
}

