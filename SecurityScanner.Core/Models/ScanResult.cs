namespace SecurityScanner.Core.Models;

public class ScanResult
{
    public required string ScanId { get; init; }
    public required DateTime StartTime { get; init; }
    public DateTime? EndTime { get; set; }
    public required ScanStatus Status { get; set; }
    public required List<Finding> Findings { get; init; } = new();
    public string? Summary { get; set; }
}

public enum ScanStatus
{
    Pending,
    Running,
    Completed,
    Failed
}

public class Finding
{
    public required string Id { get; init; }
    public required string Title { get; init; }
    public required string Description { get; init; }
    public required Severity Severity { get; init; }
    public required string Category { get; init; }
    public string? Remediation { get; init; }
}

public enum Severity
{
    Low,
    Medium,
    High,
    Critical
}
