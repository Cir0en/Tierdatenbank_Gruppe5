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

}

