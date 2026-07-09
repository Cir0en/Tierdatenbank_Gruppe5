using Microsoft.Extensions.DependencyInjection;
using LocalizationResourceManager.Maui;
using System.Globalization;
using CommunityToolkit.Mvvm.Input;
using Plugin.Firebase.CloudMessaging;

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

	protected override async void OnStart()
{
    base.OnStart();
    try
    {
        await CrossFirebaseCloudMessaging.Current.SubscribeToTopicAsync("all_users");
        Console.WriteLine("Subscribed to topic 'all_users'");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"FCM subscribe error: {ex.Message}");
    }
}
}