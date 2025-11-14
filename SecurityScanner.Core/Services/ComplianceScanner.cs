namespace SecurityScanner.Core.Services;

using System.Diagnostics;
using SecurityScanner.Core.Models;

public class ComplianceScanner
{
    private readonly string _scriptsPath;

    public ComplianceScanner(string scriptsPath = "/usr/local/share/security-scanner")
    {
        _scriptsPath = scriptsPath;
    }

    public async Task<List<Finding>> ScanOpenSCAPAsync(string profile = "standard", CancellationToken cancellationToken = default)
    {
        var findings = new List<Finding>();

        try
        {
            var scriptPath = Path.Combine(_scriptsPath, "compliance", "scan-openscap.sh");
            
            var psi = new ProcessStartInfo
            {
                FileName = "/bin/bash",
                Arguments = $"{scriptPath} --profile {profile}",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false
            };

            using var process = Process.Start(psi);
            if (process != null)
            {
                var output = await process.StandardOutput.ReadToEndAsync(cancellationToken);
                await process.WaitForExitAsync(cancellationToken);

                ParseOpenSCAPResults(output, findings);
            }
        }
        catch (Exception ex)
        {
            findings.Add(new Finding
            {
                Id = Guid.NewGuid().ToString(),
                Title = "OpenSCAP Scan Failed",
                Description = ex.Message,
                Severity = Severity.Medium,
                Category = "Compliance",
                Remediation = "Ensure OpenSCAP tools are installed"
            });
        }

        return findings;
    }

    public async Task<List<Finding>> ScanDISASTIGAsync(string category = "all", CancellationToken cancellationToken = default)
    {
        var findings = new List<Finding>();

        try
        {
            var scriptPath = Path.Combine(_scriptsPath, "compliance", "scan-disa-stig.sh");
            
            var psi = new ProcessStartInfo
            {
                FileName = "/bin/bash",
                Arguments = $"{scriptPath} --category {category}",
                RedirectStandardOutput = true,
                UseShellExecute = false
            };

            using var process = Process.Start(psi);
            if (process != null)
            {
                var output = await process.StandardOutput.ReadToEndAsync(cancellationToken);
                await process.WaitForExitAsync(cancellationToken);

                ParseSTIGResults(output, findings);
            }
        }
        catch { }

        return findings;
    }

    private void ParseOpenSCAPResults(string output, List<Finding> findings)
    {
        var lines = output.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        
        foreach (var line in lines)
        {
            if (line.Contains("fail") || line.Contains("FAIL"))
            {
                findings.Add(new Finding
                {
                    Id = Guid.NewGuid().ToString(),
                    Title = "SCAP Compliance Failure",
                    Description = line.Trim(),
                    Severity = Severity.High,
                    Category = "Compliance",
                    Remediation = "Review OpenSCAP recommendations"
                });
            }
        }
    }

    private void ParseSTIGResults(string output, List<Finding> findings)
    {
        var lines = output.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        
        foreach (var line in lines)
        {
            if (line.Contains("CAT I") || line.Contains("CAT1"))
            {
                findings.Add(new Finding
                {
                    Id = Guid.NewGuid().ToString(),
                    Title = "DISA STIG CAT I Finding",
                    Description = line.Trim(),
                    Severity = Severity.Critical,
                    Category = "Compliance",
                    Remediation = "Immediate remediation required for Category I findings"
                });
            }
        }
    }
}
