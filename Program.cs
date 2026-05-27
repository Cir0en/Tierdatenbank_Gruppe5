using NextjsStaticHosting.AspNetCore;
using Microsoft.EntityFrameworkCore;
using TodoApi.Models;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

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

builder.Services.AddControllers();
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

builder.Services.Configure<NextjsStaticHostingOptions>(builder.Configuration.GetSection("NextjsStaticHosting"));
builder.Services.AddNextjsStaticHosting();

var app = builder.Build();


// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors("AllowNextjs"); // CORS aktivieren

app.UseHttpsRedirection();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.MapNextjsStaticHtmls();
app.UseNextjsStaticHosting();

app.Run();
