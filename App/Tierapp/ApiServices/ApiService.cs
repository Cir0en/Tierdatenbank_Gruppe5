using System.Net.Http.Json;
using Tierapp.DTOs;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Tierapp.Services;

public class ApiService
{
    private readonly HttpClient _httpClient;

    public ApiService(HttpClient httpClient)
    {
        _httpClient = httpClient;

    }

    public async Task<List<CollectionListDto>> GetMyCollectionsAsync()
    {
        // Holt die Daten und wandelt sie automatisch in eine Liste von Objekten um
        var response = await _httpClient.GetFromJsonAsync<List<CollectionListDto>>("api/collections");
        return response ?? new List<CollectionListDto>();
    }

    public async Task<List<AnimalListDto>> GetMyAnimalsAsync()
    {
        // Holt die Daten und wandelt sie automatisch in eine Liste von Objekten um
        var response = await _httpClient.GetFromJsonAsync<List<AnimalListDto>>("api/animals");
        return response ?? new List<AnimalListDto>();
    }

    public async Task<int> GetCollectionsCountAsync()
    {
        var response = await _httpClient.GetFromJsonAsync<List<CollectionListDto>>("api/collections");
        return response.Count;
    }

    public async Task<int> GetFindingsCountAsync()
    {
        var response = await _httpClient.GetFromJsonAsync<List<AnimalListDto>>("api/animals");
        return response.Count;
    }

    public async Task<int> GetLocationsCountAsync()
    {
        var response = await _httpClient.GetFromJsonAsync<List<LocationListDto>>("api/geolocations");
        return response.Count;
    }

    public async Task<int> GetLoansCountAsync()
    {
        var response = await _httpClient.GetFromJsonAsync<List<LoanListDto>>("api/loans");
        return response.Count;
    }

    public async Task<CollectionDetailDto> GetCollectionDetailsAsync(int collectionId)
    {
        var response = await _httpClient.GetFromJsonAsync<CollectionDetailDto>($"api/collections/{collectionId}");
        return response ?? new CollectionDetailDto();
    }

    public async Task<CollectionItemDto> GetAnimalDetailsAsync(int animalId)
    {
        var options = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        };


        var response = await _httpClient.GetFromJsonAsync<CollectionItemDto>($"api/animals/{animalId}", options);
        return response ?? new CollectionItemDto();
    }

    public async Task<ImageDto> GetAnimalImagesAsync(int animalId)
    {
        try
        {
            var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
            var images = await _httpClient.GetFromJsonAsync<List<ImageDto>>($"api/images/{animalId}", options);
            var image = images?.FirstOrDefault();

            if (image != null && !string.IsNullOrEmpty(image.ImageUrl) && image.ImageUrl.StartsWith("/"))
            {
                image.ImageUrl = new Uri(_httpClient.BaseAddress!, image.ImageUrl).ToString();
            }
            return image;    
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error loading images for animal {animalId}: {ex.Message}");
            return null;
        }
    }
}