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
	}

	protected override Window CreateWindow(IActivationState? activationState)
	{
		return new Window(new AppShell());
	}
}