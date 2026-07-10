using System.Text.Json;
using System.Text.Json.Serialization;

namespace Tierapp.Models;

public class FlexibleStringConverter : JsonConverter<string?>
{
    public override string? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        switch (reader.TokenType)
        {
            case JsonTokenType.String:
                return reader.GetString();

            case JsonTokenType.Null:
                return null;

            case JsonTokenType.StartObject:
                // Falls ein Objekt kommt, versuchen "name" auszulesen
                using (var doc = JsonDocument.ParseValue(ref reader))
                {
                    if (doc.RootElement.TryGetProperty("name", out var nameProp))
                        return nameProp.GetString();

                    return doc.RootElement.ToString(); // Fallback: rohes Objekt als String
                }

            default:
                // Zahlen, Bools etc. - einfach als String zurückgeben
                using (var doc = JsonDocument.ParseValue(ref reader))
                {
                    return doc.RootElement.GetRawText();
                }
        }
    }

    public override void Write(Utf8JsonWriter writer, string? value, JsonSerializerOptions options)
    {
        writer.WriteStringValue(value);
    }
}