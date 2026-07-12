namespace Tierapp.DTOs;

/// <summary>DTO für Benachrichtigungen, die an den Client gesendet werden.</summary>
public class NotificationRecordDto
{
    public int Id { get; set; }
    public string Title { get; set; } = "";
    public string Body { get; set; } = "";
    public DateTime SentAt { get; set; }  = DateTime.UtcNow;
    public string? Segment { get; set; }
}