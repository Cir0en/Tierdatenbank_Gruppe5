using System;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Collections.ObjectModel;
using Microsoft.Maui.ApplicationModel;
using Tierapp.DTOs;
using Tierapp.ViewModels;

namespace Tierapp;

public partial class Dashboard : ContentPage
{

	private readonly DashboardViewModel _viewModel;
	public Dashboard(DashboardViewModel viewModel)
	{
		InitializeComponent();
		_viewModel = viewModel;
        BindingContext = _viewModel;
	}

	    protected override async void OnAppearing()
    {
        base.OnAppearing();
        await _viewModel.LoadDataCommand.ExecuteAsync(null);
    }


/*
	private async Task LoadAnimalsAsync()
	{
		Console.WriteLine("Loading animals from API...");
		try
		{
			using var http = new HttpClient { BaseAddress = new Uri(BaseUrl) };
			var resp = await http.GetAsync("api/animals");
			if (!resp.IsSuccessStatusCode)
			{
				Console.WriteLine($"API error: {resp.StatusCode}");
				return;
			}


			var content = await resp.Content.ReadAsStringAsync();
			Console.WriteLine("API response: " + content);

			var items = JsonSerializer.Deserialize<List<CollectItemDto>>(content, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

			if (items == null)
			{
				Console.WriteLine("Deserialized items is null");
				return;
			}

			MainThread.BeginInvokeOnMainThread(() =>
			{
				Animals.Clear();
				foreach (var it in items)
					Animals.Add(it);
			});
		}
		catch (Exception ex)
		{
			Console.WriteLine("LoadAnimalsAsync exception: " + ex);
		}

	}

	private async void OnRefreshClicked(object? sender, EventArgs e)
	{
		Console.WriteLine("Refresh button clicked");
		await LoadAnimalsAsync();
	}

	private async void OnTierAnlegenClicked(object? sender, EventArgs e)
	{
		Console.WriteLine("Tier anlegen button clicked");
		await Shell.Current.GoToAsync("NewAnimal");
	}
	*/
}
