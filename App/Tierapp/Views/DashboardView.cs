using LocalizationResourceManager.Maui;
using System.Globalization;
using CommunityToolkit.Mvvm.Input;
using Tierapp.DTOs;
using Tierapp.Services;
using CommunityToolkit.Mvvm.ComponentModel;
using System.Collections.ObjectModel;

namespace Tierapp.ViewModels;

public partial class DashboardViewModel : ObservableObject
{
    private readonly ApiService _apiService;
    private readonly NotificationFeedService _service = new();

    // Wir lassen uns das Interface injizieren
    public DashboardViewModel(ApiService apiService)
    {
        _apiService = apiService;
    }

    [ObservableProperty] private string _collectionCount;
    [ObservableProperty] private string _animalCount;
    [ObservableProperty] private string _locationCount;
    [ObservableProperty] private string _loanCount;
    [ObservableProperty] public partial ObservableCollection<DashboardItem> DashboardItems { get; set; } = new();

    [ObservableProperty] ObservableCollection<NotificationRecordDto> notifications = new();

    [ObservableProperty]
    public partial bool IsBusy { get; set; }

    [RelayCommand]
    public async Task LoadDataAsync()
    {
        // Hier könntest du deine API-Aufrufe machen, um die Daten für das Dashboard zu laden
        // Zum Beispiel:
        // var data = await _apiService.GetDashboardDataAsync();
        // Und dann die Daten in ObservableProperties speichern, damit das UI aktualisiert wird

        if (IsBusy) return;

        try
        {
            IsBusy = true;
            // Alle 4 Abfragen parallel starten, um Wartezeit zu minimieren
            var task1 = _apiService.GetCollectionsCountAsync();
            var task2 = _apiService.GetFindingsCountAsync();
            var task3 = _apiService.GetLocationsCountAsync();
            //var task4 = _apiService.GetLoansCountAsync();
            var notificationsTask = _service.GetNotificationsAsync();
            //var task4 = _apiService.GetLoansCountAsync();

            await Task.WhenAll(task1, task2, task3, notificationsTask);

            CollectionCount = task1.Result.ToString();
            AnimalCount = task2.Result.ToString(); 
            LocationCount = task3.Result.ToString();
            //LoanCount = task4.Result.ToString();

            DashboardItems.Clear();
            DashboardItems.Add(new DashboardItem { Title = "Animals", Count = AnimalCount, Icon = "🦋" });
            DashboardItems.Add(new DashboardItem { Title = "Collections", Count = CollectionCount, Icon = "📁" });
            DashboardItems.Add(new DashboardItem { Title = "Locations", Count = LocationCount, Icon = "🌍" });
            DashboardItems.Add(new DashboardItem { Title = "Loans", Count = "5", Icon = "📦" });

            Notifications = new ObservableCollection<NotificationRecordDto>(notificationsTask.Result);

        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error loading data: {ex.Message}");
            CollectionCount = "Error";
            AnimalCount = "Error";
            LocationCount = "Error";
            //LoanCount = "Error";  
        }
        finally
        {
            IsBusy = false;
        }
    }

    [RelayCommand]
    private async Task NavigateToSettingsAsync()
    {
        // Navigation zu den Einstellungen
        await Shell.Current.GoToAsync("//SettingsTab");
    }

    [RelayCommand]
    private async Task NavigateToCollectionsAsync()
    {
        // Navigation zu den Sammlungen
        await Shell.Current.GoToAsync("//CollectionsTab");
    }

    [RelayCommand]
    private async Task NavigateToMapAsync()
    {
        // Navigation zur Karte
        await Shell.Current.GoToAsync("//MapTab");
    }
}


