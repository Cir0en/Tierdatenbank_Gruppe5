using System;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Collections.ObjectModel;
using Microsoft.Maui.ApplicationModel;

namespace Tierapp;

public partial class Login : ContentPage
{

    private const string BaseUrl = "http://10.0.2.2:5099/";
    
    public Login()
    {
        InitializeComponent();
    }

    private async void OnLoginClicked(object sender, EventArgs e)
    {
        var username = UsernameEntry.Text;
        var password = PasswordEntry.Text;

        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
        {
            await DisplayAlertAsync("Fehler", "Bitte Benutzername und Passwort eingeben.", "OK");
            return;
        }

        try
        {
            using var http = new HttpClient { BaseAddress = new Uri(BaseUrl) };
        }
        catch (Exception ex)
        {
            await DisplayAlertAsync("Fehler", $"Verbindungsfehler: {ex.Message}", "OK");
        }
    }

    private async void OnContinueWithoutLoginClicked(object sender, EventArgs e)
    {
        await Shell.Current.GoToAsync("//MainTabs");
    }

}
