using System;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Collections.ObjectModel;
using Microsoft.Maui.ApplicationModel;

namespace Tierapp;

public partial class MainPage : ContentPage
{

	private readonly ObservableCollection<CollectItemDto> Animals = new();

	// On Android emulator, use 10.0.2.2 to reach the host machine
	private const string BaseUrl = "http://10.0.2.2:5099/";

	public MainPage()
	{
		InitializeComponent();
		AnimalsCollectionView.ItemsSource = Animals;
		_ = LoadAnimalsAsync();
	}


	private async Task LoadAnimalsAsync()
	{
		Console.WriteLine("Loading animals from API...");
		try
		{
			using var http = new HttpClient { BaseAddress = new Uri(BaseUrl) };
			var resp = await http.GetAsync("api/animals");
			if (!resp.IsSuccessStatusCode)
			{
				StatusLabel.Text = $"Status: API-Fehler {resp.StatusCode}";
				Console.WriteLine($"API error: {resp.StatusCode}");
				return;
			}


			var content = await resp.Content.ReadAsStringAsync();
			Console.WriteLine("API response: " + content);

			var items = JsonSerializer.Deserialize<List<CollectItemDto>>(content, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

			if (items == null)
			{
				StatusLabel.Text = "Status: Keine Daten";
				Console.WriteLine("Deserialized items is null");
				return;
			}

			MainThread.BeginInvokeOnMainThread(() =>
			{
				Animals.Clear();
				foreach (var it in items)
					Animals.Add(it);
				StatusLabel.Text = $"Status: {items.Count} Tiere geladen";
			});
		}
		catch (Exception ex)
		{
			StatusLabel.Text = "Status: Fehler beim Laden";
			Console.WriteLine("LoadAnimalsAsync exception: " + ex);
		}

	}

	private async void OnRefreshClicked(object? sender, EventArgs e)
	{
		Console.WriteLine("Refresh button clicked");
		await LoadAnimalsAsync();
	}

}
