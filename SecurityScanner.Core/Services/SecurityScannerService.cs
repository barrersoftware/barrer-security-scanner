namespace SecurityScanner.Core.Services;

using SecurityScanner.Core.Interfaces;
using SecurityScanner.Core.Models;

public class SecurityScannerService : ISecurityScanner
{
    private readonly Dictionary<string, ScanResult> _scans = new();

    public async Task<ScanResult> StartScanAsync(ScanConfiguration config, CancellationToken cancellationToken = default)
    {
        var scanId = Guid.NewGuid().ToString();
        var scan = new ScanResult
        {
            ScanId = scanId,
            StartTime = DateTime.UtcNow,
            Status = ScanStatus.Running,
            Findings = new()
        };

        _scans[scanId] = scan;

        _ = Task.Run(async () => await ExecuteScanAsync(scanId, config, cancellationToken), cancellationToken);

        return scan;
    }

    public Task<ScanResult?> GetScanResultAsync(string scanId, CancellationToken cancellationToken = default)
    {
        _scans.TryGetValue(scanId, out var result);
        return Task.FromResult(result);
    }

    public Task<List<ScanResult>> GetAllScansAsync(CancellationToken cancellationToken = default)
    {
        return Task.FromResult(_scans.Values.OrderByDescending(s => s.StartTime).ToList());
    }

    private async Task ExecuteScanAsync(string scanId, ScanConfiguration config, CancellationToken cancellationToken)
    {
        var scan = _scans[scanId];

        try
        {
            foreach (var scanType in config.ScanTypes)
            {
                await RunScanTypeAsync(scan, scanType, config, cancellationToken);
            }

            scan.Status = ScanStatus.Completed;
            scan.EndTime = DateTime.UtcNow;
            scan.Summary = $"Scan completed with {scan.Findings.Count} findings";
        }
        catch (Exception)
        {
            scan.Status = ScanStatus.Failed;
            scan.EndTime = DateTime.UtcNow;
        }
    }

    private Task RunScanTypeAsync(ScanResult scan, ScanType scanType, ScanConfiguration config, CancellationToken cancellationToken)
    {
        // Placeholder - will implement actual scanning logic
        return Task.CompletedTask;
    }
}
