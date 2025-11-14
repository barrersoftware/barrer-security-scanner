namespace SecurityScanner.Core.Interfaces;

using SecurityScanner.Core.Models;

public interface ISecurityScanner
{
    Task<ScanResult> StartScanAsync(ScanConfiguration config, CancellationToken cancellationToken = default);
    Task<ScanResult?> GetScanResultAsync(string scanId, CancellationToken cancellationToken = default);
    Task<List<ScanResult>> GetAllScansAsync(CancellationToken cancellationToken = default);
}

public class ScanConfiguration
{
    public required string Name { get; init; }
    public required List<ScanType> ScanTypes { get; init; }
    public string? TargetPath { get; init; }
}

public enum ScanType
{
    SystemSecurity,
    NetworkSecurity,
    CodeAnalysis,
    MalwareDetection,
    ComplianceCheck
}
