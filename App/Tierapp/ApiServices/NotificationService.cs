using Tierapp.Models;
using Tierapp.DTOs;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Net.Http.Json;

namespace Tierapp.Services;

public class NotificationFeedService
{
    private readonly HttpClient _http;

    public NotificationFeedService()
    {
        _http = new HttpClient
        {
            BaseAddress = new Uri("http://10.0.2.2:5099/")
        };
    }
    
    public async Task<List<NotificationRecordDto>> GetNotificationsAsync()
    {
        return await _http.GetFromJsonAsync<List<NotificationRecordDto>>(
            "/api/notifications/history");
    }
}