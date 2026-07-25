using Tierapp.ViewModels;
using Syncfusion.Maui.Maps;
using Tierapp.Views;

namespace Tierapp;

public partial class Map : ContentPage
{

    private readonly MapView _viewModel;
    public Map(MapView viewModel)
    {
        InitializeComponent();
        _viewModel = viewModel;
        BindingContext = _viewModel;

        tileLayer.UrlTemplate = $"https://tiles.stadiamaps.com/tiles/alidade_smooth/{{z}}/{{x}}/{{y}}.png?api_key={MapConfig.MapApiKey}";
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        // Daten beim Anzeigen der Seite laden
        await _viewModel.LoadLocationsAsync();

    /*
        // Marker werden aus Mapview in eine MapMarkerCollection geladen um sie dort anzuzeigen
        var collection = new MapMarkerCollection();

        foreach (var marker in _viewModel.Markers)
        {
            collection.Add(marker);
        }
        tileLayer.Markers = collection;
    */ 
    }

}

