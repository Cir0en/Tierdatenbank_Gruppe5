using Microsoft.EntityFrameworkCore;
using TodoApi.Models;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text.Json.Serialization;
using System.Net.Http.Headers;

var builder = WebApplication.CreateBuilder(args);

// Datenbank Konfiguration:
// User Secret bitte lokal einrichten

// EF-Core-DbContext gegen die Neon-Postgres-Datenbank; der Connection-String kommt aus der
// Konfiguration (appsettings/User Secrets), nicht hart codiert.
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
builder.Services.AddDbContext<NeondbContext>(options => options.UseNpgsql(connectionString));



// Add services to the container.

// CORS - falls unnötig kann gelöscht werden

// Erlaubt dem lokal laufenden Next.js-Frontend (Dev-Server auf Port 3000), das Backend
// aufzurufen. Für andere Deployment-Umgebungen ggf. anpassen/erweitern.
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowNextjs", policy =>
        policy.WithOrigins("http://localhost:3000")
              .AllowAnyMethod()
              .AllowAnyHeader());
});

// Authentifizierung erfolgt über JWTs, die von Clerk (externer Auth-Provider) ausgestellt werden.
// Der Authority-Wert (Issuer-URL) kommt aus der Konfiguration; die Signing Keys werden von dort
// automatisch per OIDC-Discovery bezogen.
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = builder.Configuration["Clerk:Authority"];

        // Clerk liefert eigene Claim-Namen (z.B. "sub"); ohne diese Option würde ASP.NET Core
        // manche Standard-Claims automatisch auf .NET-eigene URIs umbenennen.
        options.MapInboundClaims = false;

        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            // ValidateAudience = false: Clerk-Tokens enthalten keine für uns feste Audience,
            // die Validierung erfolgt stattdessen über Issuer + Signatur.
            ValidateAudience = false,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            // "sub" (Clerk-User-ID) wird als Name-Claim verwendet, damit User.ClerkId darüber
            // abgeglichen werden kann (siehe UserStatusMiddleware).
            NameClaimType = "sub"
        };
    });

builder.Services.AddAuthorization();

builder.Services.AddControllers().AddJsonOptions(options =>
    {
        // Verhindert JSON-Serialisierungsfehler bei zyklischen Navigation-Properties (z.B.
        // CollectItem -> Collection -> CollectItems -> ...), statt sie manuell zu vermeiden.
        options.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
        options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
    });
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

// Named HttpClient für Abfragen gegen die externe GBIF-Artendatenbank (Taxonomie-Abgleich).
builder.Services.AddHttpClient("Gbif", client =>
{
    client.BaseAddress = new Uri("https://api.gbif.org/v1/");
    client.DefaultRequestHeaders.UserAgent.ParseAdd("Collectio/1.0");
});

// Der Clerk Secret Key wird für serverseitige Aufrufe der Clerk-Management-API benötigt
// (z.B. Nutzerverwaltung) und muss zwingend konfiguriert sein - ohne ihn kann die Anwendung
// nicht sicher gegen Clerk sprechen, daher harter Abbruch beim Start.
var clerkSecretKey = builder.Configuration["CLERK_SECRET_KEY"];

if (string.IsNullOrWhiteSpace(clerkSecretKey))
{
    throw new InvalidOperationException(
        "Clerk:SecretKey wurde nicht konfiguriert.");
}

// Named HttpClient für Server-zu-Server-Aufrufe der Clerk-API, bereits mit Bearer-Auth vorkonfiguriert.
builder.Services.AddHttpClient("Clerk", client =>
{
    client.BaseAddress = new Uri("https://api.clerk.com/v1/");

    client.DefaultRequestHeaders.Authorization =
        new AuthenticationHeaderValue(
            "Bearer",
            clerkSecretKey);
});

//Notification OneSignal HttpClient
var oneSignalAppId = builder.Configuration["OneSignal:AppId"];
var oneSignalApiKey = builder.Configuration["OneSignal:ApiKey"];
Console.WriteLine($"API Key loaded: {!string.IsNullOrEmpty(oneSignalApiKey)}");

builder.Services.AddHttpClient("OneSignal", client =>
{
    client.BaseAddress = new Uri("https://api.onesignal.com/");
    client.DefaultRequestHeaders.Add("authorization",
        $"Key {oneSignalApiKey}");
});

var app = builder.Build();


// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors("AllowNextjs"); // CORS aktivieren

// Uploads-Ordner als statische Dateien bereitstellen
// Bild-Uploads (siehe ObjectImage) werden lokal im Dateisystem abgelegt und hier unter
// "/uploads" öffentlich (ohne Auth-Prüfung) ausgeliefert.
var uploadsDir = Path.Combine(builder.Environment.ContentRootPath, "uploads");
Directory.CreateDirectory(uploadsDir);
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(uploadsDir),
    RequestPath = "/uploads"
});

app.UseHttpsRedirection();

// Reihenfolge ist hier wichtig:
// 1) UseAuthentication() wertet das JWT aus und befüllt context.User (falls Token vorhanden/gültig).
// 2) UserStatusMiddleware prüft danach, ob der so identifizierte Nutzer gebannt/gelöscht ist,
//    und bricht den Request ggf. vorzeitig ab (403) - das setzt bereits gesetztes context.User voraus.
// 3) UseAuthorization() greift erst danach, damit [Authorize]-Attribute auch von einem
//    zwischenzeitlich als gesperrt erkannten Nutzer nicht mehr erreicht werden.
app.UseAuthentication();
app.UseMiddleware<TodoApi.Security.UserStatusMiddleware>();

app.UseAuthorization();

app.MapControllers();

app.Run();
