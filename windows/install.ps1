# AI Security Scanner - Windows Installation Script
# Requires PowerShell 5.1 or higher, Administrator privileges

#Requires -RunAsAdministrator

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  AI Security Scanner - Windows Installation" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Check PowerShell version
if ($PSVersionTable.PSVersion.Major -lt 5) {
    Write-Host "Error: PowerShell 5.1 or higher required" -ForegroundColor Red
    Write-Host "Current version: $($PSVersionTable.PSVersion)" -ForegroundColor Yellow
    exit 1
}

Write-Host "✓ PowerShell version: $($PSVersionTable.PSVersion)" -ForegroundColor Green

# Check if running as Administrator
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Error: This script must be run as Administrator" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Running as Administrator" -ForegroundColor Green
Write-Host ""

# Check for Chocolatey
if (-not (Get-Command choco -ErrorAction SilentlyContinue)) {
    Write-Host "Installing Chocolatey package manager..." -ForegroundColor Yellow
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    Write-Host "✓ Chocolatey installed" -ForegroundColor Green
} else {
    Write-Host "✓ Chocolatey already installed" -ForegroundColor Green
}

# Refresh environment variables
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# Install dependencies
Write-Host ""
Write-Host "Installing dependencies..." -ForegroundColor Yellow

$dependencies = @('curl', 'jq')
foreach ($dep in $dependencies) {
    if (-not (Get-Command $dep -ErrorAction SilentlyContinue)) {
        Write-Host "Installing $dep..." -ForegroundColor Yellow
        choco install $dep -y --no-progress
    } else {
        Write-Host "✓ $dep already installed" -ForegroundColor Green
    }
}

# Check for Ollama
if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    Write-Host ""
    Write-Host "Ollama not found. Installing..." -ForegroundColor Yellow
    
    # Download Ollama for Windows
    $ollamaUrl = "https://ollama.com/download/OllamaSetup.exe"
    $ollamaInstaller = "$env:TEMP\OllamaSetup.exe"
    
    Write-Host "Downloading Ollama..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri $ollamaUrl -OutFile $ollamaInstaller
    
    Write-Host "Installing Ollama..." -ForegroundColor Yellow
    Start-Process -FilePath $ollamaInstaller -ArgumentList "/VERYSILENT" -Wait
    
    Remove-Item $ollamaInstaller
    Write-Host "✓ Ollama installed" -ForegroundColor Green
    
    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
} else {
    Write-Host "✓ Ollama already installed" -ForegroundColor Green
}

# Start Ollama service
Write-Host ""
Write-Host "Starting Ollama service..." -ForegroundColor Yellow
Start-Process "ollama" -ArgumentList "serve" -WindowStyle Hidden
Start-Sleep -Seconds 3
Write-Host "✓ Ollama service started" -ForegroundColor Green

# Install scripts
Write-Host ""
Write-Host "Installing security scanner scripts..." -ForegroundColor Yellow

$installDir = "$env:ProgramFiles\AISecurityScanner"
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
Copy-Item -Path ".\windows\scripts\*" -Destination $installDir -Recurse -Force

Write-Host "✓ Scripts installed to $installDir" -ForegroundColor Green

# Create report directory
$reportDir = "$env:USERPROFILE\Documents\SecurityReports"
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
Write-Host "✓ Report directory: $reportDir" -ForegroundColor Green

# Add to PATH
$currentPath = [Environment]::GetEnvironmentVariable("Path", "Machine")
if ($currentPath -notlike "*$installDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$currentPath;$installDir", "Machine")
    Write-Host "✓ Added to system PATH" -ForegroundColor Green
}

# Model selection
Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  AI Model Selection" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Choose an AI model based on your system resources:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1) llama3.2:3b    - 4GB RAM  - Fast, good quality"
Write-Host "2) llama3.1:8b    - 8GB RAM  - Better, balanced"
Write-Host "3) llama3.1:70b   - 32GB RAM - Best, enterprise-grade"
Write-Host "4) Skip (install later)"
Write-Host ""

$choice = Read-Host "Enter choice [1-4]"

$model = switch ($choice) {
    "1" { "llama3.2:3b" }
    "2" { "llama3.1:8b" }
    "3" { "llama3.1:70b" }
    default { "" }
}

if ($model) {
    Write-Host ""
    Write-Host "Downloading AI model: $model" -ForegroundColor Yellow
    Write-Host "This may take several minutes..." -ForegroundColor Yellow
    & ollama pull $model
    Write-Host "✓ Model installed: $model" -ForegroundColor Green
    
    # Update scripts with chosen model
    Get-ChildItem -Path $installDir -Filter "*.ps1" | ForEach-Object {
        $content = Get-Content $_.FullName -Raw
        $content = $content -replace 'MODEL="llama3.1:70b"', "MODEL=`"$model`""
        Set-Content -Path $_.FullName -Value $content
    }
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Installation Complete!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Available commands:" -ForegroundColor Yellow
Write-Host "  SecurityScanner.ps1      - Run comprehensive security scan"
Write-Host "  SecurityMonitor.ps1      - Real-time threat monitoring"
Write-Host "  CodeReview.ps1 <path>    - Review code for vulnerabilities"
Write-Host "  SecurityChat.ps1         - Interactive security assistant"
Write-Host ""
Write-Host "Get started:" -ForegroundColor Yellow
Write-Host "  cd `"$installDir`""
Write-Host "  .\SecurityScanner.ps1"
Write-Host ""
Write-Host "Reports will be saved to: $reportDir" -ForegroundColor Yellow
Write-Host ""
Write-Host "Documentation: https://github.com/ssfdre38/ai-security-scanner" -ForegroundColor Cyan
Write-Host ""
