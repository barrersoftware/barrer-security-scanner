# Windows Testing Guide - AI Security Scanner v4.0.0

**Purpose:** Test AI Security Scanner on Windows environments  
**Focus:** PowerShell scripts, Windows-specific features, cross-platform compatibility

---

## Important Note

**Docker on Linux cannot run Windows containers.** Windows containers require:
- Windows 10/11 Pro or Enterprise
- Windows Server 2016+
- Docker Desktop with Windows container mode

Since we're on Ubuntu Linux, we'll provide alternative Windows testing methods.

---

## Option 1: Windows Virtual Machine (Recommended)

### Using Hyper-V (Windows Host)

1. **Create Windows Server VM:**
   ```powershell
   # On Windows host with Hyper-V
   New-VM -Name "AI-Scanner-Test" -MemoryStartupBytes 4GB -Generation 2
   Set-VM -Name "AI-Scanner-Test" -ProcessorCount 2
   ```

2. **Install Windows Server 2022:**
   - Download ISO from Microsoft
   - Attach to VM and install
   - Enable PowerShell remoting

3. **Setup Test Environment:**
   ```powershell
   # Install Chocolatey
   Set-ExecutionPolicy Bypass -Scope Process -Force
   [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
   iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))
   
   # Install Node.js and Git
   choco install -y nodejs-lts git
   
   # Clone and test
   git clone https://github.com/ssfdre38/ai-security-scanner.git
   cd ai-security-scanner
   git checkout v4
   cd web-ui
   npm install
   node server-new.js
   ```

---

## Option 2: WSL2 on Windows (Hybrid Testing)

If you have access to a Windows machine with WSL2:

1. **Install WSL2 with Ubuntu:**
   ```powershell
   wsl --install Ubuntu-22.04
   ```

2. **Inside WSL2:**
   ```bash
   # Install Node.js
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
   sudo apt-get install -y nodejs git
   
   # Clone and test
   git clone https://github.com/ssfdre38/ai-security-scanner.git
   cd ai-security-scanner
   git checkout v4
   cd web-ui
   npm install
   node server-new.js
   ```

3. **Test PowerShell Scripts from Windows:**
   ```powershell
   # Access WSL filesystem from Windows
   cd \\wsl$\Ubuntu-22.04\home\user\ai-security-scanner\scripts
   
   # Run PowerShell scripts
   .\system-info.ps1
   .\security-scan.ps1
   ```

---

## Option 3: Azure VM (Cloud Testing)

### Using Azure Free Tier

1. **Create Windows Server VM:**
   ```bash
   # Using Azure CLI
   az vm create \
     --resource-group ai-scanner-test \
     --name ai-scanner-win \
     --image Win2022Datacenter \
     --size Standard_B2s \
     --admin-username azureuser
   ```

2. **Connect via RDP:**
   - Get public IP
   - Use Remote Desktop Connection
   - Login with credentials

3. **Setup and Test:**
   ```powershell
   # Same as Option 1
   ```

---

## Option 4: GitHub Actions (CI/CD Testing)

Create a GitHub Actions workflow for Windows testing:

```yaml
# .github/workflows/test-windows.yml
name: Windows Tests

on:
  push:
    branches: [ v4 ]
  pull_request:
    branches: [ v4 ]

jobs:
  test-windows:
    runs-on: windows-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '20'
    
    - name: Install dependencies
      run: |
        cd web-ui
        npm install
    
    - name: Test server startup
      run: |
        cd web-ui
        timeout /t 10 /nobreak & node server-new.js
    
    - name: Test PowerShell scripts
      run: |
        cd scripts
        powershell -ExecutionPolicy Bypass -File system-info.ps1
```

---

## Option 5: Manual Testing on Windows PC

If you have access to a Windows PC:

### Quick Setup Script

Save this as `setup-windows-test.ps1`:

```powershell
#Requires -Version 5.1
#Requires -RunAsAdministrator

# Install Chocolatey
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))

# Install dependencies
choco install -y nodejs-lts git

# Refresh environment
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# Clone repository
cd $env:USERPROFILE\Desktop
git clone https://github.com/ssfdre38/ai-security-scanner.git
cd ai-security-scanner
git checkout v4

# Install and test
cd web-ui
npm install

Write-Host "✓ Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "To start server:" -ForegroundColor Yellow
Write-Host "  node server-new.js"
Write-Host ""
Write-Host "To test PowerShell scripts:" -ForegroundColor Yellow
Write-Host "  cd ..\scripts"
Write-Host "  .\system-info.ps1"
```

### Run Setup:
```powershell
# As Administrator
powershell -ExecutionPolicy Bypass -File setup-windows-test.ps1
```

---

## PowerShell Scripts to Test

The scanner includes Windows-specific PowerShell scripts:

### Available Scripts (scripts/*.ps1)

1. **system-info.ps1** - System information gathering
2. **security-audit.ps1** - Security configuration audit
3. **network-scan.ps1** - Network configuration check
4. **user-audit.ps1** - User and permissions audit
5. **service-audit.ps1** - Service configuration check
6. **firewall-audit.ps1** - Windows Firewall audit
7. **update-check.ps1** - Windows Update status

### Test Each Script:

```powershell
cd ai-security-scanner\scripts

# Test system info
.\system-info.ps1 -OutputFormat JSON

# Test security audit
.\security-audit.ps1 -Detailed

# Test network scan
.\network-scan.ps1 -IncludeIPConfig
```

---

## Testing Checklist

### Server Tests on Windows
- [ ] Node.js installed correctly
- [ ] Dependencies install without errors
- [ ] Server starts successfully
- [ ] All 7 plugins load
- [ ] API endpoints accessible on Windows

### PowerShell Script Tests
- [ ] Scripts execute without errors
- [ ] Proper output format (JSON)
- [ ] System information collected
- [ ] Security checks complete
- [ ] Network information gathered

### Cross-Platform Tests
- [ ] Same APIs work on Windows as Linux
- [ ] File paths handled correctly (\ vs /)
- [ ] PowerShell scripts called correctly from Node.js
- [ ] Backup/restore works on Windows
- [ ] Storage paths work on Windows

### Windows-Specific Features
- [ ] Windows Event Log integration
- [ ] Windows Firewall detection
- [ ] Windows Defender status
- [ ] Active Directory integration (if applicable)
- [ ] Windows Update detection

---

## Expected Behavior on Windows

### Server Startup
```
Platform: Microsoft Windows
Distro: Windows 10 Pro / Windows Server 2022
Shell: C:\Windows\System32\cmd.exe (or PowerShell)
✅ Loaded plugin: scanner v1.0.0
✅ Loaded plugin: storage v1.0.0
✅ All 7 plugins loaded
```

### PowerShell Script Execution
```powershell
PS C:\> .\scripts\system-info.ps1
{
  "computerName": "WIN-TEST",
  "osVersion": "10.0.22621",
  "platform": "Windows",
  "architecture": "AMD64",
  "memory": "16 GB",
  "cpu": "Intel Core i7",
  ...
}
```

---

## Known Windows Considerations

### Path Differences
- Linux: `/home/user/ai-security-scanner`
- Windows: `C:\Users\user\ai-security-scanner`
- Solution: Use `path.join()` in Node.js (already implemented)

### Line Endings
- Linux: LF (`\n`)
- Windows: CRLF (`\r\n`)
- Solution: Git handles automatically with `.gitattributes`

### PowerShell Execution Policy
```powershell
# May need to allow script execution
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Firewall
- Windows Firewall may block Node.js
- Add exception: `netsh advfirewall firewall add rule name="Node.js" dir=in action=allow program="C:\Program Files\nodejs\node.exe"`

---

## Troubleshooting

### Issue: "npm install" fails
**Solution:**
```powershell
# Clear npm cache
npm cache clean --force

# Use legacy peer deps
npm install --legacy-peer-deps
```

### Issue: PowerShell script won't run
**Solution:**
```powershell
# Check execution policy
Get-ExecutionPolicy

# Set to allow scripts
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Issue: Port 3001 in use
**Solution:**
```powershell
# Find process using port
netstat -ano | findstr :3001

# Kill process
taskkill /PID <PID> /F
```

### Issue: Git clone fails
**Solution:**
```powershell
# Install Git
choco install git -y

# Or use Git Bash
# Download from: https://git-scm.com/download/win
```

---

## Alternative: Test on Current Ubuntu System

Since Windows containers aren't available on Linux, you can:

1. **Test PowerShell Scripts on Linux:**
   ```bash
   # Install PowerShell on Ubuntu
   wget -q https://packages.microsoft.com/config/ubuntu/$(lsb_release -rs)/packages-microsoft-prod.deb
   sudo dpkg -i packages-microsoft-prod.deb
   sudo apt-get update
   sudo apt-get install -y powershell
   
   # Test scripts
   cd /home/ubuntu/ai-security-scanner/scripts
   pwsh -File system-info.ps1
   ```

2. **Verify Cross-Platform Code:**
   - Check path handling
   - Test storage plugin on Linux (simulates Windows)
   - Verify backup creation with both tar.gz and zip

---

## Automated Testing Script

If you get access to a Windows machine, use this automated test:

```powershell
# Save as: test-ai-scanner-windows.ps1
# Run as: powershell -ExecutionPolicy Bypass -File test-ai-scanner-windows.ps1

# See test-windows.ps1 file created above for full script
```

---

## CI/CD Integration

### GitHub Actions Windows Runner

Add to `.github/workflows/test-windows.yml`:

```yaml
name: Windows Tests
on: [push, pull_request]
jobs:
  windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: cd web-ui && npm install
      - run: cd web-ui && npm test
      - run: cd scripts && pwsh -File system-info.ps1
```

This runs automatically on every push to GitHub.

---

## Summary

**Best Options for Windows Testing:**

1. **For Now:** Test PowerShell scripts on Ubuntu with `pwsh`
2. **For Full Testing:** Use GitHub Actions (free Windows runner)
3. **For Local Testing:** Windows VM or WSL2
4. **For Production:** Deploy to Windows Server and test

**What Can Be Tested on Linux:**
- ✅ PowerShell Core scripts (with pwsh)
- ✅ Node.js server on Windows paths (simulation)
- ✅ Cross-platform code paths
- ✅ API compatibility

**What Needs Real Windows:**
- Windows-specific APIs (Event Log, Registry)
- Windows Firewall integration
- Active Directory integration
- Windows Service management

---

**Created:** 2025-10-13 17:18 UTC  
**Version:** v4.0.0  
**Status:** Windows testing guide complete
