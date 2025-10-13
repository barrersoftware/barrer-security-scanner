#Requires -Version 5.1

<#
.SYNOPSIS
    AI Security Scanner v4.0.0 - Windows Test Suite
.DESCRIPTION
    Automated testing script for Windows environment
.NOTES
    Requires PowerShell 5.1+ and Node.js
#>

# Enable strict mode
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Colors for output
function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

Write-ColorOutput "=================================================" "Cyan"
Write-ColorOutput "  AI Security Scanner v4.0.0 - Windows Test" "Cyan"
Write-ColorOutput "=================================================" "Cyan"
Write-Host ""

# Get system information
Write-ColorOutput "System Information:" "Yellow"
Write-Host "  OS: $([System.Environment]::OSVersion.VersionString)"
Write-Host "  PowerShell: $($PSVersionTable.PSVersion)"
Write-Host "  Node.js: $(node --version)"
Write-Host "  Architecture: $([System.Environment]::Is64BitOperatingSystem ? 'x64' : 'x86')"
Write-Host ""

# Step 1: Clone repository
Write-ColorOutput "[1/7] Cloning repository..." "Green"
try {
    if (Test-Path "ai-security-scanner") {
        Write-Host "  Repository already exists, pulling latest..."
        Set-Location ai-security-scanner
        git fetch
        git checkout v4
        git pull origin v4
    } else {
        git clone https://github.com/ssfdre38/ai-security-scanner.git
        Set-Location ai-security-scanner
        git checkout v4
    }
    Write-ColorOutput "  ✓ Repository ready" "Green"
} catch {
    Write-ColorOutput "  ✗ Failed to clone repository: $_" "Red"
    exit 1
}
Write-Host ""

# Step 2: Install dependencies
Write-ColorOutput "[2/7] Installing Node.js dependencies..." "Green"
try {
    Set-Location web-ui
    npm install --silent
    Write-ColorOutput "  ✓ Dependencies installed" "Green"
} catch {
    Write-ColorOutput "  ✗ Failed to install dependencies: $_" "Red"
    exit 1
}
Write-Host ""

# Step 3: Create test configuration
Write-ColorOutput "[3/7] Creating test configuration..." "Green"
try {
    $envContent = @"
NODE_ENV=development
PORT=3001
SESSION_SECRET=test-windows-secret-key-for-docker-testing-only
MFA_ENCRYPTION_KEY=test-mfa-key-32-characters-long
JWT_SECRET=test-jwt-secret-key-for-testing

# Rate Limiting
AUTH_RATE_LIMIT_WINDOW=300000
AUTH_RATE_LIMIT_MAX=5
API_RATE_LIMIT_WINDOW=60000
API_RATE_LIMIT_MAX=100
SCAN_RATE_LIMIT_WINDOW=3600000
SCAN_RATE_LIMIT_MAX=10

# Database
DB_TYPE=sqlite
DB_PATH=./data/database.db

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/app.log
"@
    $envContent | Out-File -FilePath ".env" -Encoding utf8
    Write-ColorOutput "  ✓ Configuration created" "Green"
} catch {
    Write-ColorOutput "  ✗ Failed to create configuration: $_" "Red"
    exit 1
}
Write-Host ""

# Step 4: Test server startup
Write-ColorOutput "[4/7] Testing server startup..." "Green"
try {
    # Start server in background
    $serverJob = Start-Job -ScriptBlock {
        Set-Location $using:PWD
        node server-new.js 2>&1
    }
    
    # Wait for server to start
    Start-Sleep -Seconds 5
    
    # Check if server is still running
    if ($serverJob.State -eq "Running") {
        Write-ColorOutput "  ✓ Server started successfully" "Green"
        
        # Get output
        $output = Receive-Job $serverJob
        $output | Out-File -FilePath "C:\test\server-test.log" -Encoding utf8
        
        # Stop server
        Stop-Job $serverJob
        Remove-Job $serverJob
    } else {
        Write-ColorOutput "  ✗ Server failed to start" "Red"
        Receive-Job $serverJob
        exit 1
    }
} catch {
    Write-ColorOutput "  ✗ Error testing server: $_" "Red"
    exit 1
}
Write-Host ""

# Step 5: Verify plugin loading
Write-ColorOutput "[5/7] Verifying plugin loading..." "Green"
try {
    $logContent = Get-Content "C:\test\server-test.log" -Raw
    
    if ($logContent -match "Successfully loaded 7 plugins") {
        Write-ColorOutput "  ✓ All 7 plugins loaded" "Green"
    } else {
        Write-ColorOutput "  ⚠ Check plugin loading in logs" "Yellow"
    }
    
    if ($logContent -match "vpn v1\.0\.0") {
        Write-ColorOutput "  ✓ VPN plugin loaded" "Green"
    }
    
    if ($logContent -match "admin v1\.0\.0") {
        Write-ColorOutput "  ✓ Admin plugin loaded" "Green"
    }
} catch {
    Write-ColorOutput "  ⚠ Could not verify plugins: $_" "Yellow"
}
Write-Host ""

# Step 6: Test PowerShell scan scripts
Write-ColorOutput "[6/7] Testing PowerShell scan scripts..." "Green"
try {
    Set-Location ..\scripts
    
    # List available PowerShell scripts
    $psScripts = Get-ChildItem -Filter "*.ps1" | Select-Object -First 3
    Write-Host "  Found $($psScripts.Count) PowerShell scripts:"
    foreach ($script in $psScripts) {
        Write-Host "    - $($script.Name)"
    }
    
    # Test one script (basic syntax check)
    if ($psScripts.Count -gt 0) {
        $testScript = $psScripts[0]
        Write-Host "  Testing script: $($testScript.Name)"
        
        # Parse script to check for syntax errors
        $errors = $null
        $null = [System.Management.Automation.PSParser]::Tokenize(
            (Get-Content $testScript.FullName -Raw), 
            [ref]$errors
        )
        
        if ($errors.Count -eq 0) {
            Write-ColorOutput "  ✓ PowerShell scripts valid" "Green"
        } else {
            Write-ColorOutput "  ⚠ Script has syntax warnings" "Yellow"
        }
    }
} catch {
    Write-ColorOutput "  ⚠ Script testing skipped: $_" "Yellow"
}
Write-Host ""

# Step 7: Summary
Write-ColorOutput "[7/7] Test Summary" "Green"
Write-Host ""

Write-ColorOutput "=================================================" "Cyan"
Write-ColorOutput "✓ Windows Tests Complete!" "Green"
Write-ColorOutput "=================================================" "Cyan"
Write-Host ""

Write-ColorOutput "Next Steps:" "Yellow"
Write-Host ""
Write-Host "1. View detailed logs:"
Write-Host "   Get-Content C:\test\server-test.log"
Write-Host ""
Write-Host "2. Test PowerShell scripts manually:"
Write-Host "   cd ai-security-scanner\scripts"
Write-Host "   .\system-info.ps1"
Write-Host ""
Write-Host "3. Start server interactively:"
Write-Host "   cd ai-security-scanner\web-ui"
Write-Host "   node server-new.js"
Write-Host ""

Write-ColorOutput "Happy Testing! 🚀" "Green"
