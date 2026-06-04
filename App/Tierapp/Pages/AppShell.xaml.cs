namespace Tierapp;

public partial class AppShell : Shell
{
	public AppShell()
	{
		InitializeComponent();

		Routing.RegisterRoute(nameof(NewAnimal), typeof(NewAnimal));
	}
}
