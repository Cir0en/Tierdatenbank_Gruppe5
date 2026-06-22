using NextjsStaticHosting.AspNetCore;
using Microsoft.EntityFrameworkCore;
using TodoApi.Models;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text.Json.Serialization;
using System.Net.Http.Headers;

var builder = WebApplication.CreateBuilder(args);

// Datenbank Konfiguration:
// User Secret bitte lokal einrichten

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
builder.Services.AddDbContext<NeondbContext>(options => options.UseNpgsql(connectionString));



// Add services to the container.

// CORS - falls unnötig kann gelöscht werden

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowNextjs", policy =>
        policy.WithOrigins("http://localhost:3000")
              .AllowAnyMethod()
              .AllowAnyHeader());
});

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = builder.Configuration["Clerk:Authority"];

        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = false,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            NameClaimType = "sub"
        };
    });

builder.Services.AddAuthorization();

builder.Services.AddControllers().AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
        options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
    });
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

builder.Services.Configure<NextjsStaticHostingOptions>(builder.Configuration.GetSection("NextjsStaticHosting"));
builder.Services.AddNextjsStaticHosting();

builder.Services.AddHttpClient("Gbif", client =>
{
    client.BaseAddress = new Uri("https://api.gbif.org/v1/");
    client.DefaultRequestHeaders.UserAgent.ParseAdd("Collectio/1.0");
});

var clerkSecretKey = builder.Configuration["CLERK_SECRET_KEY"];

if (string.IsNullOrWhiteSpace(clerkSecretKey))
{
    throw new InvalidOperationException(
        "Clerk:SecretKey wurde nicht konfiguriert.");
}

builder.Services.AddHttpClient("Clerk", client =>
{
    client.BaseAddress = new Uri("https://api.clerk.com/v1/");

    client.DefaultRequestHeaders.Authorization =
        new AuthenticationHeaderValue(
            "Bearer",
            clerkSecretKey);
});

var app = builder.Build();


// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors("AllowNextjs"); // CORS aktivieren

// Uploads-Ordner als statische Dateien bereitstellen
var uploadsDir = Path.Combine(builder.Environment.ContentRootPath, "uploads");
Directory.CreateDirectory(uploadsDir);
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(uploadsDir),
    RequestPath = "/uploads"
});

app.UseHttpsRedirection();

app.UseAuthentication();
app.UseMiddleware<TodoApi.Security.UserStatusMiddleware>();

app.UseAuthorization();

app.MapControllers();

app.MapNextjsStaticHtmls();
app.UseNextjsStaticHosting();

app.Run();
