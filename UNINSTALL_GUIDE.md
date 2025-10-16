# Uninstall & Cleanup Guide

Two scripts are available for removing AI Security Scanner:

## Quick Test Cleanup (Recommended for Testing)

**Script:** `cleanup-test.sh`

Fast cleanup that removes only the AI Security Scanner while preserving Node.js, Postfix, and system dependencies for quick redeployment.

```bash
bash cleanup-test.sh
```

**What it removes:**
- ✅ AI Security Scanner installation
- ✅ Running processes
- ✅ Systemd service
- ✅ Log files

**What it preserves:**
- ✅ Node.js and npm
- ✅ Postfix mail server
- ✅ System dependencies (curl, wget, git)

**Best for:**
- Testing deployments
- Quick iteration cycles
- Development environments
- When you'll redeploy soon

## Complete Uninstall

**Script:** `uninstall.sh`

Full uninstall with options to remove all components including dependencies.

### Basic Uninstall (Preserves Dependencies)
```bash
sudo bash uninstall.sh
```

Removes AI Security Scanner but keeps Node.js, Postfix, and system tools.

### Complete Removal (Everything)
```bash
sudo bash uninstall.sh --remove-nodejs --remove-postfix --remove-deps
```

Removes everything including Node.js, Postfix, and all dependencies.

### Forced Removal (No Prompts)
```bash
sudo bash uninstall.sh --force --remove-nodejs --remove-postfix
```

## Command-Line Options

| Flag | Description |
|------|-------------|
| `--remove-nodejs` | Also remove Node.js and npm |
| `--remove-postfix` | Also remove Postfix mail server |
| `--remove-deps` | Also remove system dependencies |
| `--force` | Skip confirmation prompts |
| `-h, --help` | Show help message |

## Usage Examples

### Development/Testing Workflow

```bash
# 1. Deploy and test
sudo bash setup-noninteractive.sh --auto --skip-ssl --skip-postfix

# 2. Test your changes...

# 3. Quick cleanup
bash cleanup-test.sh

# 4. Deploy again (faster since deps already installed)
sudo bash setup-noninteractive.sh --auto --skip-ssl --skip-postfix
```

### Remote Test VPS Cleanup

```bash
# Quick cleanup on test server
ssh test-vps 'bash /home/ubuntu/ai-security-scanner/cleanup-test.sh'

# Complete cleanup
ssh test-vps 'sudo bash /home/ubuntu/ai-security-scanner/uninstall.sh --force'
```

### CI/CD Pipeline Cleanup

```bash
# In your pipeline cleanup stage
- name: Cleanup
  run: |
    ssh $TEST_SERVER 'bash ~/ai-security-scanner/cleanup-test.sh'
```

## What Gets Removed

### Quick Test Cleanup (`cleanup-test.sh`)
- Installation directory
- Running Node.js processes
- Systemd service file
- Log files in /tmp

### Basic Uninstall (`uninstall.sh`)
All of the above, plus:
- Configuration files in /etc
- User configuration files
- SSL certificates (if self-signed)
- Service logs

### Complete Uninstall (`uninstall.sh --remove-*`)
All of the above, plus:
- Node.js and npm (if `--remove-nodejs`)
- Postfix mail server (if `--remove-postfix`)
- System dependencies (if `--remove-deps`)
- Package repository configurations
- Package cache

## Verification After Cleanup

### Check if service is removed:
```bash
systemctl status ai-security-scanner
# Should show: Unit ai-security-scanner.service could not be found
```

### Check if processes are stopped:
```bash
ps aux | grep "node.*server.js"
# Should show no results
```

### Check if installation is removed:
```bash
ls -la ~/ai-security-scanner
# Should show: No such file or directory
```

### Check if Node.js is still installed:
```bash
node --version
# Shows version if preserved, error if removed
```

## OVHcloud VPS Reset Alternative

If you want a completely fresh start on OVHcloud VPS:

### Option 1: Use Cleanup Scripts (Faster)
```bash
# Complete removal
sudo bash uninstall.sh --force --remove-nodejs --remove-postfix --remove-deps
```

### Option 2: Reinstall OS (Slower but 100% clean)
1. Log into OVHcloud control panel
2. Select your VPS
3. Go to "Reinstall my VPS"
4. Choose Ubuntu 24.04
5. Wait for reinstallation (~5-10 minutes)

**Use Option 1** for quick testing cycles
**Use Option 2** if you need absolute clean slate

## Troubleshooting

### Service won't stop
```bash
sudo systemctl stop ai-security-scanner
sudo pkill -9 -f "node.*server.js"
```

### Permission denied errors
```bash
# Run with sudo
sudo bash uninstall.sh
```

### "Directory not empty" errors
```bash
# Force remove
sudo rm -rf /home/ubuntu/ai-security-scanner
```

### Port still in use after cleanup
```bash
# Find and kill process using port 3001
sudo lsof -ti:3001 | xargs kill -9
```

## Testing Cycle Workflow

Recommended workflow for iterative testing:

```bash
# 1. Initial deployment
sudo bash setup-noninteractive.sh --auto --skip-ssl --skip-postfix

# 2. Test and verify
curl http://localhost:3001

# 3. Quick cleanup (keeps dependencies)
bash cleanup-test.sh

# 4. Redeploy with changes
rsync -avz ai-security-scanner/ test-vps:/home/ubuntu/ai-security-scanner/
ssh test-vps 'cd ai-security-scanner/web-ui && npm install && nohup node server.js &'

# 5. Repeat as needed
```

## Safety Features

Both scripts include:
- ✅ Confirmation prompts (unless `--force`)
- ✅ Safe file removal (no system files touched)
- ✅ Graceful service shutdown
- ✅ Process termination before cleanup
- ✅ Clear status messages
- ✅ Non-destructive by default

## What's NOT Removed

Unless explicitly requested, these are preserved:
- Operating system files
- Other applications
- User home directory structure
- SSH keys and configuration
- Firewall rules
- Network configuration
- Database systems
- Web servers (nginx, apache)

## Support

If cleanup fails or you encounter issues:
1. Check script output for errors
2. Verify you're running with appropriate permissions (sudo)
3. Check running processes: `ps aux | grep scanner`
4. Check service status: `systemctl status ai-security-scanner`
5. Manual cleanup: Follow commands in scripts manually
