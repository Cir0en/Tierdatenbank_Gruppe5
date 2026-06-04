using System;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Collections.ObjectModel;
using Microsoft.Maui.ApplicationModel;
using Tierapp.DTOs;

namespace Tierapp;

public partial class Sammlungen : ContentPage
{

    private readonly ObservableCollection<CollectionListDto> Collections = new();

    private const string BaseUrl = "http://10.0.2.2:5099/";

    public Sammlungen()
    {
        InitializeComponent();
        SammlungsView.ItemsSource = Collections;
        _ = LoadCollectionsAsync();
    }

    private async Task LoadCollectionsAsync()
    {
        Console.WriteLine("Loading collections from API...");
        try
        {
            using var http = new HttpClient { BaseAddress = new Uri(BaseUrl) };
            var resp = await http.GetAsync("api/collections");
            if (!resp.IsSuccessStatusCode)
            {
                StatusLabel.Text = $"Status: API-Fehler {resp.StatusCode}";
                Console.WriteLine($"API error: {resp.StatusCode}");
                return;
            }

            var content = await resp.Content.ReadAsStringAsync();
            Console.WriteLine("API response: " + content);

            var items = JsonSerializer.Deserialize<List<CollectionListDto>>(content, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            if (items == null)
            {
                StatusLabel.Text = "Status: Keine Daten";
                Console.WriteLine("Deserialized items is null");
                return;
            }

            MainThread.BeginInvokeOnMainThread(() =>
            {
                Collections.Clear();
                foreach (var it in items)
                    Collections.Add(it);
                if (items.Count == 1)
                    StatusLabel.Text = "1 Sammlung geladen";
                else
                StatusLabel.Text = $"Status: {items.Count} Sammlungen geladen";
            });
        }
        catch (Exception ex)
        {
            StatusLabel.Text = $"Status: Fehler {ex.Message}";
            Console.WriteLine($"Error loading collections: {ex}");
        }
    }

    private async void OnRefreshClicked(object sender, EventArgs e)
    {
        Console.WriteLine("Refresh clicked");
        await LoadCollectionsAsync();
    }
}
