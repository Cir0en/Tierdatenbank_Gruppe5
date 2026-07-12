using Tierapp.ViewModels;
using Microsoft.Extensions.Configuration;

namespace Tierapp;

public partial class Map : ContentPage
{
    private bool _isInitialized = false;

    public Map()
    {
        InitializeComponent();
    }

    protected override void OnAppearing()
    {
        base.OnAppearing();

        // Wenn es bereits geladen wurde, tun wir nichts
        if (_isInitialized) return;

        try
        {
            if (MapWebView != null)
            {
                // 1. Events abonnieren
                MapWebView.Navigated += OnWebViewNavigated;
                MapWebView.Navigating += OnWebViewNavigating;

                // 2. Die HTML-Datei direkt als Text/Stream aus den App-Ressourcen lesen
                using var stream = FileSystem.OpenAppPackageFileAsync("map.html").Result;
                using var reader = new StreamReader(stream);
                string htmlContent = reader.ReadToEnd();

                // 3. Den HTML-Inhalt direkt als String an die WebView übergeben
                // Das funktioniert auf Android zu 100%, da kein Dateipfad aufgelöst werden muss
                MapWebView.Source = new HtmlWebViewSource 
                { 
                    Html = htmlContent 
                };

                _isInitialized = true;
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Kritischer Fehler beim Laden der HTML-Datei: {ex.Message}");
            DisplayAlert("Fehler", $"HTML-Datei konnte nicht geladen werden: {ex.Message}", "OK");
        }
    }

    private async void OnWebViewNavigated(object sender, WebNavigatedEventArgs e)
    {
        // Dieser Breakpoint MUSS jetzt getroffen werden, da der HTML-String lokal sofort da ist!
        if (e.Result == WebNavigationResult.Success)
        {
            string apiKey = MapConfig.MapTilerKey;

            if (string.IsNullOrEmpty(apiKey) || apiKey.Contains("HIER_DEIN_ECHTER"))
            {
                await DisplayAlert("Konfigurationsfehler", "Bitte tragt euren API-Key in MapConfig.cs ein!", "OK");
                return;
            }

            string jsCommand = $"initializeMap(\"{apiKey}\");";
            await MapWebView.EvaluateJavaScriptAsync(jsCommand);
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

