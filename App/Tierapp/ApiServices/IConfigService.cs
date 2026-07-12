using Microsoft.Extensions.Configuration;

public interface IConfigService { string MapTilerKey { get; } }
public class ConfigService : IConfigService { 
    private readonly IConfiguration _configuration;

    public ConfigService(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public string MapTilerKey => _configuration["MapTiler:ApiKey"] ?? string.Empty;
}