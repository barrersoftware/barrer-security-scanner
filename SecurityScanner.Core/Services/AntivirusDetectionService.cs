namespace SecurityScanner.Core.Services;

using System.Diagnostics;
using SecurityScanner.Core.Models;

public class AntivirusDetectionService
{
    public async Task<InstalledAntivirus?> DetectInstalledAntivirusAsync(CancellationToken cancellationToken = default)
    {
        // Check for ClamAV
        if (await IsCommandAvailableAsync("clamscan", cancellationToken))
        {
            return new InstalledAntivirus
            {
                Name = "ClamAV",
                ScanCommand = "clamscan",
                Type = AntivirusType.OpenSource
            };
        }

        // Check for Sophos
        if (await IsCommandAvailableAsync("savscan", cancellationToken))
        {
            return new InstalledAntivirus
            {
                Name = "Sophos",
                ScanCommand = "savscan",
                Type = AntivirusType.Commercial
            };
        }

        // Check for McAfee
        if (await IsCommandAvailableAsync("uvscan", cancellationToken))
        {
            return new InstalledAntivirus
            {
                Name = "McAfee",
                ScanCommand = "uvscan",
                Type = AntivirusType.Commercial
            };
        }

        // Check for ESET
        if (await IsCommandAvailableAsync("esets_scan", cancellationToken))
        {
            return new InstalledAntivirus
            {
                Name = "ESET",
                ScanCommand = "esets_scan",
                Type = AntivirusType.Commercial
            };
        }

        // Check for Trend Micro
        if (await IsCommandAvailableAsync("splxcmd", cancellationToken))
        {
            return new InstalledAntivirus
            {
                Name = "Trend Micro",
                ScanCommand = "splxcmd",
                Type = AntivirusType.Commercial
            };
        }

        return null;
    }

    private async Task<bool> IsCommandAvailableAsync(string command, CancellationToken cancellationToken)
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "which",
                Arguments = command,
                RedirectStandardOutput = true,
                UseShellExecute = false
            };

            using var process = Process.Start(psi);
            if (process != null)
            {
                await process.WaitForExitAsync(cancellationToken);
                return process.ExitCode == 0;
            }
        }
        catch { }

        return false;
    }
}

public class InstalledAntivirus
{
    public required string Name { get; init; }
    public required string ScanCommand { get; init; }
    public required AntivirusType Type { get; init; }
}

public enum AntivirusType
{
    OpenSource,
    Commercial,
    Enterprise
}
