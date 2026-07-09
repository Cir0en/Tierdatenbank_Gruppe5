using Microsoft.Extensions.Logging;
using System.Net.Http.Json;
using Tierapp.ViewModels;
using Tierapp.Services;
using Microsoft.Extensions.DependencyInjection;
using LocalizationResourceManager.Maui;
using System.Resources;
using Tierapp.Views;
using Plugin.Firebase.CloudMessaging;
#if ANDROID
using Plugin.Firebase.Core.Platforms.Android;
#endif
using Microsoft.Maui.LifecycleEvents;

namespace Tierapp;

public static class MauiProgram
{
	public static MauiApp CreateMauiApp()
	{
#if ANDROID
    	Firebase.Crashlytics.FirebaseCrashlytics.Instance.SetCrashlyticsCollectionEnabled(false);
#endif

		var builder = MauiApp.CreateBuilder();
		builder
			.UseMauiApp<App>()
			.ConfigureFonts(fonts =>
			{
				fonts.AddFont("OpenSans-Regular.ttf", "OpenSansRegular");
				fonts.AddFont("OpenSans-Semibold.ttf", "OpenSansSemibold");
			})
			.UseMauiMaps()
			.UseLocalizationResourceManager(settings =>
			{
				settings.AddResource(new ResourceManager("Tierapp.Resources.Languages.AppResources", typeof(App).Assembly));

			})
			.ConfigureLifecycleEvents(events =>
			{;
#if ANDROID
				events.AddAndroid(android => android.OnCreate((activity, _) =>
					CrossFirebase.Initialize(activity, () => Platform.CurrentActivity!)));
#endif
			});

		ConfigureServices(builder.Services);




#if DEBUG
		builder.Logging.AddDebug();
#endif

		return builder.Build();
	}

	private static void ConfigureServices(IServiceCollection services)
	{
		services.AddHttpClient<ApiService>(client =>
		{
			client.BaseAddress = new Uri("http://10.0.2.2:5099/");
		});

		// ViewModel registrieren
		services.AddTransient<SammlungsViewModel>();
		services.AddTransient<SettingsViewModel>();
		services.AddTransient<DashboardViewModel>();
		services.AddTransient<SammlungDetailsViewModel>();
		services.AddTransient<AnimalDetailViewModel>();
		services.AddTransient<NotificationTestViewModel>();

		// Pages registrieren
		services.AddTransient<Dashboard>();
		services.AddTransient<Sammlungen>();
		services.AddTransient<Settings>();
		services.AddTransient<SammlungDetails>();
		services.AddTransient<AnimalDetail>();
		services.AddTransient<SplashPage>();
		services.AddTransient<NotificationTest>();
	} 

}
