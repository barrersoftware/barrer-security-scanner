namespace SecurityScanner.Core.Services;

using System.Diagnostics;
using SecurityScanner.Core.Models;

public class RootkitScanner
{
    public async Task<List<Finding>> ScanAsync(CancellationToken cancellationToken = default)
    {
        var findings = new List<Finding>();

        await ScanWithRkhunterAsync(findings, cancellationToken);
        await ScanWithChkrootkitAsync(findings, cancellationToken);

        return findings;
    }

    private async Task ScanWithRkhunterAsync(List<Finding> findings, CancellationToken cancellationToken)
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "rkhunter",
                Arguments = "--check --skip-keypress",
                RedirectStandardOutput = true,
                UseShellExecute = false
            };

            using var process = Process.Start(psi);
            if (process != null)
            {
                var output = await process.StandardOutput.ReadToEndAsync(cancellationToken);
                await process.WaitForExitAsync(cancellationToken);

                if (output.Contains("Warning"))
                {
                    var lines = output.Split('\n');
                    foreach (var line in lines)
                    {
                        if (line.Contains("Warning"))
                        {
                            findings.Add(new Finding
                            {
                                Id = Guid.NewGuid().ToString(),
                                Title = "Rootkit Warning (rkhunter)",
                                Description = line.Trim(),
                                Severity = Severity.Critical,
                                Category = "Rootkit",
                                Remediation = "Investigate rootkit warning immediately"
                            });
                        }
                    }
                }
            }
        }
        catch { }
    }

    private async Task ScanWithChkrootkitAsync(List<Finding> findings, CancellationToken cancellationToken)
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "chkrootkit",
                Arguments = "",
                RedirectStandardOutput = true,
                UseShellExecute = false
            };

            using var process = Process.Start(psi);
            if (process != null)
            {
                var output = await process.StandardOutput.ReadToEndAsync(cancellationToken);
                await process.WaitForExitAsync(cancellationToken);

                if (output.Contains("INFECTED"))
                {
                    var lines = output.Split('\n');
                    foreach (var line in lines)
                    {
                        if (line.Contains("INFECTED"))
                        {
                            findings.Add(new Finding
                            {
                                Id = Guid.NewGuid().ToString(),
                                Title = "Rootkit Detected (chkrootkit)",
                                Description = line.Trim(),
                                Severity = Severity.Critical,
                                Category = "Rootkit",
                                Remediation = "System compromised - immediate action required"
                            });
                        }
                    }
                }
            }
        }
        catch { }
    }
}
