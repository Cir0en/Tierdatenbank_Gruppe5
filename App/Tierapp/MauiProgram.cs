using Microsoft.Extensions.Logging;
using System.Net.Http.Json;
using Tierapp.ViewModels;
using Tierapp.Services;
using Microsoft.Extensions.DependencyInjection;
using LocalizationResourceManager.Maui;
using System.Resources;
using Tierapp.Views;
using Microsoft.Maui.LifecycleEvents;

namespace Tierapp;

public static class MauiProgram
{
	public static MauiApp CreateMauiApp()
	{
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

		// Pages registrieren
		services.AddTransient<Dashboard>();
		services.AddTransient<Sammlungen>();
		services.AddTransient<Settings>();
		services.AddTransient<SammlungDetails>();
		services.AddTransient<AnimalDetail>();
		services.AddTransient<SplashPage>();
	} 

}
