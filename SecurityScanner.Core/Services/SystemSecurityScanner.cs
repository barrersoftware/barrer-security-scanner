namespace SecurityScanner.Core.Services;

using System.Diagnostics;
using SecurityScanner.Core.Models;

public class SystemSecurityScanner
{
    public async Task<List<Finding>> ScanAsync(CancellationToken cancellationToken = default)
    {
        var findings = new List<Finding>();

        await CheckListeningPortsAsync(findings, cancellationToken);
        await CheckFirewallAsync(findings, cancellationToken);
        await CheckSuidBinariesAsync(findings, cancellationToken);

        return findings;
    }

    private async Task CheckListeningPortsAsync(List<Finding> findings, CancellationToken cancellationToken)
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "ss",
                Arguments = "-tuln",
                RedirectStandardOutput = true,
                UseShellExecute = false
            };

            using var process = Process.Start(psi);
            if (process != null)
            {
                var output = await process.StandardOutput.ReadToEndAsync(cancellationToken);
                await process.WaitForExitAsync(cancellationToken);

                var lines = output.Split('\n', StringSplitOptions.RemoveEmptyEntries);
                if (lines.Length > 10)
                {
                    findings.Add(new Finding
                    {
                        Id = Guid.NewGuid().ToString(),
                        Title = "Multiple Listening Ports Detected",
                        Description = $"Found {lines.Length} listening ports",
                        Severity = Severity.Medium,
                        Category = "Network",
                        Remediation = "Review and close unnecessary listening ports"
                    });
                }
            }
        }
        catch { }
    }

    private Task CheckFirewallAsync(List<Finding> findings, CancellationToken cancellationToken)
    {
        // Placeholder
        return Task.CompletedTask;
    }

    private Task CheckSuidBinariesAsync(List<Finding> findings, CancellationToken cancellationToken)
    {
        // Placeholder
        return Task.CompletedTask;
    }
}
