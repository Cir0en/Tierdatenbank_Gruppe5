using Tierapp.Views;

namespace Tierapp;

public partial class AppShell : Shell
{
	public AppShell()
	{
		InitializeComponent();

		Routing.RegisterRoute(nameof(SammlungDetails), typeof(SammlungDetails));
		Routing.RegisterRoute(nameof(AnimalDetail), typeof(AnimalDetail));
		Routing.RegisterRoute(nameof(SplashPage), typeof(SplashPage));

	}
}
