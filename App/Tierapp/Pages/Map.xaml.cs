using Tierapp.ViewModels;
using Microsoft.Extensions.Configuration;
#if ANDROID
using Android.Webkit;
using Android.Views;
#endif

namespace Tierapp;

public partial class Map : ContentPage
{
    private bool _isInitialized = false;

    public Map()
    {
        InitializeComponent();

        // 1. Events abonnieren
        MapWebView.Navigated += OnWebViewNavigated;
        MapWebView.Navigating += OnWebViewNavigating;

#if ANDROID
        MapWebView.HandlerChanged += OnMapWebViewHandlerChanged;
#endif
    }

#if ANDROID
    private void OnMapWebViewHandlerChanged(object sender, EventArgs e)
    {
        if (MapWebView.Handler?.PlatformView is Android.Webkit.WebView platformWebView)
        {
            platformWebView.Settings.JavaScriptEnabled = true;
            platformWebView.Settings.DomStorageEnabled = true;
            platformWebView.Settings.MixedContentMode = Android.Webkit.MixedContentHandling.CompatibilityMode;
            platformWebView.SetLayerType(Android.Views.LayerType.Hardware, null);
        }
    }
#endif

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        if (_isInitialized) return;

        try
        {
            using var stream = await FileSystem.OpenAppPackageFileAsync("map.html");
            using var reader = new StreamReader(stream);
            string htmlContent = await reader.ReadToEndAsync();

            MapWebView.Source = new HtmlWebViewSource { Html = htmlContent, BaseUrl = "https://cdn.maptiler.com/" };
            _isInitialized = true;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Fehler: {ex.Message}");
        }
    }

    private async void OnWebViewNavigated(object sender, WebNavigatedEventArgs e)
    {
        if (e.Result == WebNavigationResult.Success)
        {

            string apiKey = "0";

            // Wir rufen die globale Funktion "window.initializeMap" auf
            string jsCommand = $"window.initializeMap('{apiKey}');";

            await MapWebView.EvaluateJavaScriptAsync(jsCommand);
            System.Diagnostics.Debug.WriteLine("JS Befehl gesendet: " + jsCommand);
        }
    }

    private void OnWebViewNavigating(object sender, WebNavigatingEventArgs e)
    {
        if (e.Url.StartsWith("maui://pinclick"))
        {
            e.Cancel = true;

            var uri = new Uri(e.Url);
            var query = System.Web.HttpUtility.ParseQueryString(uri.Query);
            string pinName = query["name"] ?? "Unbekanntes Tier";

            DisplayAlert("Tierdatenbank", $"Details für: {pinName}", "OK");
        }
    }
}

