using System;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Collections.ObjectModel;
using Microsoft.Maui.ApplicationModel;
using Tierapp.ViewModels;


namespace Tierapp.Views;

public partial class SplashPage : ContentPage
{
    public SplashPage()
    {
        InitializeComponent();
    }

    private async void OnImageLoaded(object sender, EventArgs e)
    {
        await Task.Delay(5000); // z.B. 2 Sekunden anzeigen
        await Shell.Current.GoToAsync("//MainTabs"); // Route zu deiner Startseite
    }
}