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

public partial class Sammlungen : ContentPage
{

    private readonly SammlungsViewModel _viewModel;
    private const string BaseUrl = "http://10.0.2.2:5099/";

    public Sammlungen(SammlungsViewModel viewModel)
    {
        InitializeComponent();
        _viewModel = viewModel;
        BindingContext = _viewModel;
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        await _viewModel.LoadCollectionsCommand.ExecuteAsync(null);
    }
}
