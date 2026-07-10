namespace TodoApi.Models;

/// <summary>Model für Benachrichtigungen, die an den Client gesendet werden.</summary>

public class NotificationSendRequest
{
    public string Title { get; set; } = "";
    public string Body { get; set; } = "";
    public string? Segment { get; set; }
}