using System;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Collections.ObjectModel;
using Microsoft.Maui.ApplicationModel;
using Tierapp.ViewModels;

namespace Tierapp;

public partial class Settings : ContentPage
{
    public Settings(SettingsViewModel viewModel)
    {
        InitializeComponent();
        BindingContext = viewModel;
    }

    public async void OnDarkModeClicked(object sender, EventArgs e)
    {
        await Shell.Current.DisplayAlert("Theme", "Dark mode selected", "OK");
        // Implement dark mode logic here
    }

    public async void OnLightModeClicked(object sender, EventArgs e)
    {
        await Shell.Current.DisplayAlert("Theme", "Light mode selected", "OK");
        // Implement light mode logic here
    }

}

