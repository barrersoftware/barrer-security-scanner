namespace SecurityScanner.Core.Services;

using System.Diagnostics;
using SecurityScanner.Core.Models;

public class NetworkSecurityScanner
{
    public async Task<List<Finding>> ScanAsync(CancellationToken cancellationToken = default)
    {
        var findings = new List<Finding>();

        await CheckOpenPortsAsync(findings, cancellationToken);
        await CheckActiveConnectionsAsync(findings, cancellationToken);
        await CheckDnsConfigAsync(findings, cancellationToken);

        return findings;
    }

    private async Task CheckOpenPortsAsync(List<Finding> findings, CancellationToken cancellationToken)
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "netstat",
                Arguments = "-tuln",
                RedirectStandardOutput = true,
                UseShellExecute = false
            };

            using var process = Process.Start(psi);
            if (process != null)
            {
                var output = await process.StandardOutput.ReadToEndAsync(cancellationToken);
                await process.WaitForExitAsync(cancellationToken);

                var dangerousPorts = new[] { "23", "21", "69", "135", "445" };
                foreach (var port in dangerousPorts)
                {
                    if (output.Contains($":{port}"))
                    {
                        findings.Add(new Finding
                        {
                            Id = Guid.NewGuid().ToString(),
                            Title = $"Dangerous Port {port} Open",
                            Description = $"Port {port} is listening and should be closed",
                            Severity = Severity.High,
                            Category = "Network",
                            Remediation = $"Close port {port} or restrict access with firewall rules"
                        });
                    }
                }
            }
        }
        catch { }
    }

    private async Task CheckActiveConnectionsAsync(List<Finding> findings, CancellationToken cancellationToken)
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "netstat",
                Arguments = "-an",
                RedirectStandardOutput = true,
                UseShellExecute = false
            };

            using var process = Process.Start(psi);
            if (process != null)
            {
                var output = await process.StandardOutput.ReadToEndAsync(cancellationToken);
                await process.WaitForExitAsync(cancellationToken);

                var lines = output.Split('\n', StringSplitOptions.RemoveEmptyEntries);
                var establishedCount = lines.Count(l => l.Contains("ESTABLISHED"));

                if (establishedCount > 50)
                {
                    findings.Add(new Finding
                    {
                        Id = Guid.NewGuid().ToString(),
                        Title = "High Number of Active Connections",
                        Description = $"{establishedCount} established connections detected",
                        Severity = Severity.Medium,
                        Category = "Network",
                        Remediation = "Review active connections for suspicious activity"
                    });
                }
            }
        }
        catch { }
    }

    private Task CheckDnsConfigAsync(List<Finding> findings, CancellationToken cancellationToken)
    {
        // Placeholder for DNS configuration checks
        return Task.CompletedTask;
    }
}
