namespace TodoApi.Models;

/// <summary>Model für Benachrichtigungen, die an den Client gesendet werden.</summary>

public class NotificationRecord
{
    public int Id { get; set; }
    public string Title { get; set; } = "";
    public string Body { get; set; } = "";
    public DateTime SentAt { get; set; }  = DateTime.UtcNow;
    public string? Segment { get; set; }
    public string id_onesignal { get; set; }
}