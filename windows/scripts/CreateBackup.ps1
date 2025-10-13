<#
.SYNOPSIS
    Create compressed backup archive for Windows 7+ and Server 2008+
.DESCRIPTION
    Creates a ZIP archive of specified directories using native Windows compression
    Compatible with Windows 7, 8, 10, 11 and Server 2008, 2012, 2016, 2019, 2022
.PARAMETER BackupName
    Name of the backup file
.PARAMETER BackupPath
    Destination path for backup
.PARAMETER Sources
    Array of source paths to backup
.PARAMETER Encrypt
    Enable encryption (uses Windows EFS)
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$BackupName,
    
    [Parameter(Mandatory=$true)]
    [string]$BackupPath,
    
    [Parameter(Mandatory=$true)]
    [string[]]$Sources,
    
    [switch]$Encrypt
)

# Set error action preference
$ErrorActionPreference = "Stop"

# Check Windows version compatibility
$osVersion = [System.Environment]::OSVersion.Version
$isCompatible = ($osVersion.Major -ge 6 -and $osVersion.Minor -ge 1) -or ($osVersion.Major -gt 6)

if (-not $isCompatible) {
    Write-Error "This script requires Windows 7/Server 2008 R2 or later"
    exit 1
}

Write-Host "Windows Version: $($osVersion.Major).$($osVersion.Minor)" -ForegroundColor Cyan
Write-Host "Creating backup: $BackupName" -ForegroundColor Green

# Ensure backup directory exists
$backupDir = Split-Path -Parent $BackupPath
if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    Write-Host "Created backup directory: $backupDir" -ForegroundColor Yellow
}

# Create temporary staging directory
$tempDir = Join-Path $env:TEMP "backup_staging_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
Write-Host "Staging directory: $tempDir" -ForegroundColor Cyan

try {
    # Copy sources to staging directory
    $totalSize = 0
    foreach ($source in $Sources) {
        if (Test-Path $source) {
            $sourceName = Split-Path -Leaf $source
            $destPath = Join-Path $tempDir $sourceName
            
            Write-Host "Copying: $source -> $destPath" -ForegroundColor Gray
            
            if (Test-Path $source -PathType Container) {
                # Directory
                Copy-Item -Path $source -Destination $destPath -Recurse -Force
                $size = (Get-ChildItem -Path $destPath -Recurse | Measure-Object -Property Length -Sum).Sum
            } else {
                # File
                Copy-Item -Path $source -Destination $destPath -Force
                $size = (Get-Item $source).Length
            }
            
            $totalSize += $size
            Write-Host "  Size: $([math]::Round($size / 1MB, 2)) MB" -ForegroundColor Gray
        } else {
            Write-Warning "Source not found, skipping: $source"
        }
    }
    
    Write-Host "`nTotal staged size: $([math]::Round($totalSize / 1MB, 2)) MB" -ForegroundColor Green
    
    # Create ZIP archive using .NET compression (works on Windows 7+)
    Write-Host "`nCreating ZIP archive..." -ForegroundColor Yellow
    
    # Load compression assembly (available since .NET 4.5 / Windows 7+)
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    
    # Remove existing backup if it exists
    if (Test-Path $BackupPath) {
        Remove-Item -Path $BackupPath -Force
        Write-Host "Removed existing backup" -ForegroundColor Yellow
    }
    
    # Create compressed archive with optimal compression
    [System.IO.Compression.ZipFile]::CreateFromDirectory(
        $tempDir,
        $BackupPath,
        [System.IO.Compression.CompressionLevel]::Optimal,
        $false
    )
    
    $backupSize = (Get-Item $BackupPath).Length
    $compressionRatio = [math]::Round((1 - ($backupSize / $totalSize)) * 100, 2)
    
    Write-Host "`n✓ Backup created successfully!" -ForegroundColor Green
    Write-Host "  File: $BackupPath" -ForegroundColor Cyan
    Write-Host "  Size: $([math]::Round($backupSize / 1MB, 2)) MB" -ForegroundColor Cyan
    Write-Host "  Compression: $compressionRatio%" -ForegroundColor Cyan
    
    # Calculate SHA-256 checksum
    Write-Host "`nCalculating checksum..." -ForegroundColor Yellow
    $hash = Get-FileHash -Path $BackupPath -Algorithm SHA256
    Write-Host "  SHA-256: $($hash.Hash)" -ForegroundColor Cyan
    
    # Encrypt if requested (Windows 7+ EFS)
    if ($Encrypt) {
        Write-Host "`nEncrypting backup with EFS..." -ForegroundColor Yellow
        
        try {
            # Use Windows Encrypting File System
            $file = Get-Item $BackupPath
            $file.Encrypt()
            Write-Host "✓ Backup encrypted successfully" -ForegroundColor Green
            $encrypted = $true
        } catch {
            Write-Warning "Encryption failed: $_"
            Write-Warning "EFS may not be available on this system"
            $encrypted = $false
        }
    } else {
        $encrypted = $false
    }
    
    # Create metadata file
    $metadata = @{
        BackupName = $BackupName
        Created = Get-Date -Format "o"
        OriginalSize = $totalSize
        CompressedSize = $backupSize
        CompressionRatio = $compressionRatio
        Checksum = $hash.Hash
        Encrypted = $encrypted
        WindowsVersion = "$($osVersion.Major).$($osVersion.Minor)"
        PowerShellVersion = $PSVersionTable.PSVersion.ToString()
        Sources = $Sources
    }
    
    $metadataPath = "$BackupPath.meta.json"
    $metadata | ConvertTo-Json -Depth 10 | Set-Content -Path $metadataPath -Encoding UTF8
    Write-Host "`n✓ Metadata saved: $metadataPath" -ForegroundColor Green
    
    # Output JSON result for Node.js integration
    $result = @{
        success = $true
        backup = @{
            path = $BackupPath
            size = $backupSize
            checksum = $hash.Hash
            encrypted = $encrypted
            metadata = $metadataPath
        }
    }
    
    Write-Host "`n--- RESULT ---" -ForegroundColor Magenta
    $result | ConvertTo-Json -Depth 10
    
} catch {
    Write-Error "Backup failed: $_"
    
    # Output error JSON
    $result = @{
        success = $false
        error = $_.Exception.Message
    }
    
    Write-Host "`n--- RESULT ---" -ForegroundColor Red
    $result | ConvertTo-Json -Depth 10
    
    exit 1
    
} finally {
    # Cleanup staging directory
    if (Test-Path $tempDir) {
        Remove-Item -Path $tempDir -Recurse -Force
        Write-Host "`nCleaned up staging directory" -ForegroundColor Gray
    }
}

Write-Host "`n✓ Backup operation complete!" -ForegroundColor Green
