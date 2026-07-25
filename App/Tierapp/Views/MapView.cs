using LocalizationResourceManager.Maui;
using System.Globalization;
using CommunityToolkit.Mvvm.Input;
using Tierapp.DTOs;
using Tierapp.Services;
using CommunityToolkit.Mvvm.ComponentModel;
using System.Collections.ObjectModel;
using Syncfusion.Maui.Maps;
using Com.OneSignal.Android;
using Android.Gms.Maps.Model;

namespace Tierapp.Views;

public partial class MapView : ObservableObject
{
    private readonly ApiService _apiService;


    public MapView(ApiService apiService)
        {
            _apiService = apiService;
        }

    [ObservableProperty] public partial List<GeoLocation> GeoLocations { get; set; }= new();
    [ObservableProperty] public partial bool IsBusy { get; set; }
    [ObservableProperty] public partial ObservableCollection<CustomMapMarker> Markers { get; set; }= new();
    [ObservableProperty] private string _filterText = string.Empty;

    [RelayCommand]
    public async Task LoadLocationsAsync()
    {
        if (IsBusy) return;

        try
        {
            IsBusy = true;
            var data = await _apiService.GetLocationsAsync();

            GeoLocations = data;
            await SetMarkers(data);
            

        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error loading location details: {ex.Message}");
        }
        finally
        {
            IsBusy = false;
        }

    }


    public async Task SetMarkers(List<GeoLocation> data)
    {           
        var newMarkers = new ObservableCollection<CustomMapMarker>();
        var markerColor = Color.FromArgb("#1A4E2E");
        var markerBorderColor = Color.FromArgb("#131E14");

        
        foreach (var item in data)
        {  
            try 
            { 
            var animalData = await _apiService.GetAnimalDetailsAsync(item.Id);
            if (animalData == null) continue;

            var animalCollection = await _apiService.GetCollectionDetailsAsync(animalData.CollectionId);

            string locationName = item.Name;
            string animalName = animalData.Name ?? "Unbekannt";
            string collectionName = animalCollection?.Name ?? "Keine Collection";

            // Filtern falls Suchbegriff angegeben
            if (!string.IsNullOrWhiteSpace(FilterText))
            {
                bool matchesLocation = locationName.Contains(FilterText, StringComparison.OrdinalIgnoreCase);
                bool matchesAnimal = animalName.Contains(FilterText, StringComparison.OrdinalIgnoreCase);
                bool matchesCollection = collectionName.Contains(FilterText, StringComparison.OrdinalIgnoreCase);

                // Wenn der Suchbegriff in keinem der drei Felder vorkommt, überspringen (ausfiltern)
                if (!matchesLocation && !matchesAnimal && !matchesCollection)
                {
                    continue;
                }
            }

            newMarkers.Add(new CustomMapMarker
                {
                    Latitude = (double)item.Latitude,
                    Longitude = (double)item.Longitude,
                    LocationName = locationName,
                    Name = animalName,
                    CollectionName = collectionName,
                    IconWidth = 24,
                    IconHeight = 24,
                    IconFill = markerColor,
                    IconStroke = markerBorderColor,
                    IconStrokeThickness = 2
                });

            } catch (Exception) {continue;}
        }
        
        Markers = newMarkers;
    }
}

public class CustomMapMarker : MapMarker
{
    public string Name { get; set; }
    public string LocationName { get; set; }
    public string CollectionName {get; set;}
}