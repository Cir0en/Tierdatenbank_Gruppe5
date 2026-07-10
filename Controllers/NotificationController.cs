using System.Globalization;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TodoApi.Models;
using TodoApi.DTOs;


namespace TodoApi.Controllers;

[ApiController]
[Route("api/notifications")]
public class NotificationsController : ControllerBase
{
    private readonly NeondbContext _context;
    private readonly IHttpClientFactory _httpFactory;
    private readonly IConfiguration _config;

    public NotificationsController(
        NeondbContext context, IHttpClientFactory httpFactory, IConfiguration config)
    {
        _context = context;
        _httpFactory = httpFactory;
        _config = config;
    }

    // POST api/notifications/send
    [HttpPost("send")]
    public async Task<IActionResult> Send([FromBody] NotificationSendRequest request)
    {
        // 1. An OneSignal senden
        var client = _httpFactory.CreateClient("OneSignal");
        var payload = new
        {
            app_id = _config["2890ff20-ad12-48a4-a215-316b48315cdb"],
            target_channel = "push",
            headings = new { en = request.Title },
            contents = new { en = request.Body },
            included_segments = new[] { request.Segment ?? "Test Users" }
        };

        var response = await client.PostAsJsonAsync("notifications", payload);

        if (!response.IsSuccessStatusCode)
        {
            var error = await response.Content.ReadAsStringAsync();
            return StatusCode((int)response.StatusCode,
                new { message = "OneSignal Fehler", detail = error });
        }

        // 2. In Neon DB speichern
        var record = new NotificationRecord
        {
            Title = request.Title,
            Body = request.Body,
            Segment = request.Segment ?? "Test Users"
        };
        _context.Notifications.Add(record);
        await _context.SaveChangesAsync();

        return Ok(record);
    }

    // GET api/notifications/history?limit=50
    [HttpGet("history")]
    public async Task<IActionResult> History([FromQuery] int limit = 50)
    {
        var notifications = await _context.Notifications
            .OrderByDescending(n => n.SentAt)
            .Take(limit)
            .ToListAsync();

        return Ok(notifications);
    }
}