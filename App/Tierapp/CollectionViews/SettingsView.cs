using LocalizationResourceManager.Maui;
using System.Globalization;
using CommunityToolkit.Mvvm.Input;
using Tierapp.DTOs;
using Tierapp.Services;
using CommunityToolkit.Mvvm.ComponentModel;


namespace Tierapp.ViewModels;

public partial class SettingsViewModel : ObservableObject
{
    private readonly ILocalizationResourceManager _localization;

    // Wir lassen uns das Interface injizieren
    public SettingsViewModel(ILocalizationResourceManager localization)
    {
        _localization = localization;
    }

    [RelayCommand]
    public void ChangeLanguage(string cultureCode)
    {
        _localization.CurrentCulture = new CultureInfo(cultureCode);
        Preferences.Default.Set("AppLanguage", cultureCode);
    }
}