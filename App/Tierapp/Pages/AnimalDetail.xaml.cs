using System.Collections.ObjectModel;
using Microsoft.Maui.ApplicationModel;
using Tierapp.DTOs;
using Tierapp.ViewModels;

namespace Tierapp;

[QueryProperty(nameof(AnimalId), "animalId")]
public partial class AnimalDetail : ContentPage
{
    private int _animalId;
    public int AnimalId
    {
        get => _animalId;
        set
        {
            _animalId = value;
            // Hier den Ladevorgang starten, sobald die ID gesetzt ist
            ((AnimalDetailViewModel)BindingContext).LoadAnimalDetailsAsync(_animalId);
        }
    }

    private readonly AnimalDetailViewModel _viewModel;

    public AnimalDetail(AnimalDetailViewModel viewModel)
    {
        InitializeComponent();
        _viewModel = viewModel;
        BindingContext = _viewModel;
    }
}