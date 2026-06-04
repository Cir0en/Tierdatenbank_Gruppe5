using System;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Collections.ObjectModel;
using Microsoft.Maui.ApplicationModel;
using Tierapp.DTOs;

namespace Tierapp;

public partial class NewAnimal : ContentPage
{
    private const string BaseUrl = "http://10.0.2.2:5099/";

    public NewAnimal()
    {
        InitializeComponent();
    }

    private async void OnSubmitClicked(object sender, EventArgs e)
    {
        var newAnimal = new CollectItemDto
        {
            Name = NameEntry.Text,
            FindDate = ((DateTime)FindDatePicker.Date).ToString("yyyy-MM-dd"),
            Description = DescriptionEntry.Text,
            Status = "ausstehend"
        };

        Console.WriteLine($"Neues Tier: {newAnimal.Name}, gefunden am {newAnimal.FindDate}, Beschreibung: {newAnimal.Description}");

        try
        {
            using var http = new HttpClient { BaseAddress = new Uri(BaseUrl) };
            var json = JsonSerializer.Serialize(newAnimal);
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            var resp = await http.PostAsync("api/animals", content);

            if (resp.IsSuccessStatusCode)
            {
                await DisplayAlertAsync("Erfolg", "Neues Tier hinzugefügt!", "OK");
                // Optionally navigate back or clear the form
            }
            else
            {
                await DisplayAlertAsync("Fehler", $"API-Fehler: {resp.StatusCode}", "OK");
            }
        }
        catch (Exception ex)
        {
            await DisplayAlertAsync("Fehler", $"Fehler beim Hinzufügen des Tieres: {ex.Message}", "OK");
        }
    }
}
