using System.Net.Http.Json;
using Tierapp.DTOs;

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
}