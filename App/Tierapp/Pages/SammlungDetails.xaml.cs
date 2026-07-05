using System.Collections.ObjectModel;
using Microsoft.Maui.ApplicationModel;
using Tierapp.DTOs;
using Tierapp.ViewModels;

namespace Tierapp;

[QueryProperty(nameof(CollectionId), "collectionId")]
public partial class SammlungDetails : ContentPage
{
    private int _collectionId;
    public int CollectionId
    {
        get => _collectionId;
        set
        {
            _collectionId = value;
            // Hier den Ladevorgang starten, sobald die ID gesetzt ist
            ((SammlungDetailsViewModel)BindingContext).LoadCollectionDetailsAsync(_collectionId);
        }
    }


    private readonly SammlungDetailsViewModel _viewModel;

    public SammlungDetails(SammlungDetailsViewModel viewModel)
    {
        InitializeComponent();
        _viewModel = viewModel;
        BindingContext = _viewModel;
    }


}