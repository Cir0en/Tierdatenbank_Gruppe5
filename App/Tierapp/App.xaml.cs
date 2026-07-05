using Microsoft.Extensions.DependencyInjection;
using LocalizationResourceManager.Maui;
using System.Globalization;
using CommunityToolkit.Mvvm.Input;

namespace Tierapp;

public partial class App : Application
{
	public App()
	{
		InitializeComponent();

		var savedTheme = Preferences.Default.Get("AppTheme", "Unspecified");
    	Application.Current.UserAppTheme = Enum.TryParse<AppTheme>(savedTheme, out var theme)
        ? theme
        : AppTheme.Unspecified;
	}

	protected override Window CreateWindow(IActivationState? activationState)
	{
		return new Window(new AppShell());
	}
}