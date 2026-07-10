using Microsoft.Extensions.DependencyInjection;
using LocalizationResourceManager.Maui;
using System.Globalization;
using CommunityToolkit.Mvvm.Input;
using OneSignalSDK.DotNet;
using OneSignalSDK.DotNet.Core;
using OneSignalSDK.DotNet.Core.Debug;

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


		// Enable verbose OneSignal logging to debug issues if needed.
		OneSignal.Debug.LogLevel = LogLevel.VERBOSE;

		// OneSignal Initialization
		OneSignal.Initialize("2890ff20-ad12-48a4-a215-316b48315cdb");

		// RequestPermissionAsync will show the notification permission prompt.
		// We recommend removing the following code and instead using an In-App Message to prompt for notification permission (See step 5)
		OneSignal.Notifications.RequestPermissionAsync(true);


	}

	protected override Window CreateWindow(IActivationState? activationState)
	{
		return new Window(new AppShell());
	}

}