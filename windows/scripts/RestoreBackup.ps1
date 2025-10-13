<#
.SYNOPSIS
    Restore backup archive for Windows 7+ and Server 2008+
.DESCRIPTION
    Extracts and restores ZIP backup archive
    Compatible with Windows 7, 8, 10, 11 and Server 2008, 2012, 2016, 2019, 2022
.PARAMETER BackupPath
    Path to backup ZIP file
.PARAMETER RestorePath
    Destination path for restore
.PARAMETER VerifyChecksum
    Expected SHA-256 checksum for verification
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$BackupPath,
    
    [Parameter(Mandatory=$true)]
    [string]$RestorePath,
    
    [string]$VerifyChecksum
)

$ErrorActionPreference = "Stop"

Write-Host "Restoring backup from: $BackupPath" -ForegroundColor Green
Write-Host "Restore destination: $RestorePath" -ForegroundColor Cyan

try {
    # Verify backup file exists
    if (-not (Test-Path $BackupPath)) {
        throw "Backup file not found: $BackupPath"
    }
    
    # Verify checksum if provided
    if ($VerifyChecksum) {
        Write-Host "`nVerifying checksum..." -ForegroundColor Yellow
        $hash = Get-FileHash -Path $BackupPath -Algorithm SHA256
        
        if ($hash.Hash -ne $VerifyChecksum) {
            throw "Checksum mismatch! Backup may be corrupted.`nExpected: $VerifyChecksum`nActual: $($hash.Hash)"
        }
        
        Write-Host "✓ Checksum verified" -ForegroundColor Green
    }
    
    # Ensure restore directory exists
    if (-not (Test-Path $RestorePath)) {
        New-Item -ItemType Directory -Path $RestorePath -Force | Out-Null
        Write-Host "Created restore directory: $RestorePath" -ForegroundColor Yellow
    }
    
    # Extract ZIP archive
    Write-Host "`nExtracting backup..." -ForegroundColor Yellow
    
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($BackupPath, $RestorePath)
    
    Write-Host "✓ Backup extracted successfully" -ForegroundColor Green
    
    # Count restored files
    $restoredFiles = (Get-ChildItem -Path $RestorePath -Recurse -File).Count
    Write-Host "Restored files: $restoredFiles" -ForegroundColor Cyan
    
    # Output JSON result
    $result = @{
        success = $true
        restore = @{
            path = $RestorePath
            filesRestored = $restoredFiles
        }
    }
    
    Write-Host "`n--- RESULT ---" -ForegroundColor Magenta
    $result | ConvertTo-Json -Depth 10
    
    Write-Host "`n✓ Restore operation complete!" -ForegroundColor Green
    
} catch {
    Write-Error "Restore failed: $_"
    
    $result = @{
        success = $false
        error = $_.Exception.Message
    }
    
    Write-Host "`n--- RESULT ---" -ForegroundColor Red
    $result | ConvertTo-Json -Depth 10
    
    exit 1
}
