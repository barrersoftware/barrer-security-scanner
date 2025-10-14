# Update Plugin

**Version:** 1.0.0  
**Category:** Security  
**Priority:** 100 (Critical)

Cross-platform system update management with multi-platform package manager support, cryptographic verification, and zero telemetry. Security-first design for enterprise deployments.

---

## 📋 Table of Contents

- [Features](#features)
- [Platform Support](#platform-support)
- [Architecture](#architecture)
- [Installation](#installation)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Usage Examples](#usage-examples)
- [Security](#security)
- [Troubleshooting](#troubleshooting)

---

## ✨ Features

### Core Features
- ✅ **Multi-Platform Support** - Linux, macOS, Windows
- ✅ **16+ Package Managers** - Universal interface for all major package managers
- ✅ **Windows Update Integration** - Native Windows Update support
- ✅ **Automatic Rollback** - Safe rollback on update failure
- ✅ **Cryptographic Verification** - SHA-256/512 checksums and GPG signatures
- ✅ **Zero Telemetry** - Complete privacy, no data collection
- ✅ **Real-time Notifications** - WebSocket and notification plugin integration
- ✅ **Update History** - Complete audit trail of all updates
- ✅ **Backup Management** - Automatic backups before updates
- ✅ **Tenant Isolation** - Multi-tenant safe with proper isolation

### Security Features
- 🔒 HTTPS-only enforcement
- 🔒 Authentication required on all endpoints
- 🔒 Permission-based access control
- 🔒 Cryptographic verification required
- 🔒 Automatic backup before updates
- 🔒 Safe rollback on failure
- 🔒 Zero telemetry design
- 🔒 Tenant data isolation

---

## 🌐 Platform Support

### Linux
**Distributions:**
- Ubuntu/Debian
- RedHat/Fedora/CentOS
- Arch Linux
- openSUSE
- Any systemd-based distribution

**Package Managers:**
- `apt` / `apt-get` / `dpkg`
- `yum` / `dnf` / `rpm`
- `pacman`
- `zypper`
- `snap`
- `flatpak`

### macOS
**Package Managers:**
- `brew` (Homebrew)
- `port` (MacPorts)

### Windows
**Update Methods:**
- Windows Update (native)
- `winget` (Windows Package Manager)
- `choco` (Chocolatey)
- `scoop` (Scoop)

**Supported Versions:**
- Windows 10
- Windows 11
- Windows Server 2016+

### Containers
- Docker
- Podman

---

## 🏗️ Architecture

### Services

**1. Platform Detector**
- Detects operating system and distribution
- Identifies available package managers
- Selects primary package manager
- Provides platform-specific paths

**2. Package Manager Service**
- Universal interface for all package managers
- Check for updates
- Install/remove packages
- Search packages
- Clean cache

**3. Windows Update Service**
- PowerShell integration
- PSWindowsUpdate module support
- WUA COM fallback
- Reboot management

**4. Verification Service**
- SHA-256/512 checksum calculation
- GPG signature verification
- File integrity validation

**5. Rollback Manager**
- Pre-update backup creation
- Version tracking
- Safe rollback execution
- Backup lifecycle management

**6. Update Notifier**
- WebSocket real-time notifications
- Notification plugin integration
- Progress updates
- Status alerts

**7. Update Manager**
- Main orchestration service
- Complete update workflow
- Configuration management
- History tracking

### Database Schema

**update_history:**
- Tracks all update operations
- Success/failure status
- Rollback availability
- Timestamp tracking

**update_config:**
- Per-tenant configuration
- Auto-update settings
- Package manager preferences
- Notification settings

**update_backups:**
- Backup metadata
- Backup location tracking
- Expiration dates
- Size tracking

---

## 📦 Installation

### Prerequisites
```bash
# Node.js 16+
node --version

# Database (SQLite/PostgreSQL/MySQL)
# Package managers (platform-specific)

# Windows only: PowerShell 5.1+
# Optional: PSWindowsUpdate module
```

### Plugin Installation

The update plugin is automatically loaded by the plugin manager. No manual installation required.

### Optional Windows Setup

For enhanced Windows Update support:

```powershell
# Install PSWindowsUpdate module
Install-Module PSWindowsUpdate -Force -AllowClobber
```

---

## ⚙️ Configuration

### Per-Tenant Configuration

Configure update settings for each tenant via API or database:

```javascript
{
  "auto_check": true,          // Automatically check for updates
  "auto_download": false,       // Automatically download updates
  "auto_install": false,        // Automatically install updates
  "check_interval": 86400,      // Check interval in seconds (24 hours)
  "update_channel": "stable",   // Update channel (stable/beta/dev)
  "package_manager": "apt",     // Preferred package manager
  "backup_before_update": true, // Create backup before updating
  "notification_enabled": true  // Send notifications
}
```

### Environment Variables

```bash
# Optional overrides
CONFIG_DIR=/etc/ai-security-scanner
DATA_DIR=/var/lib/ai-security-scanner
LOG_DIR=/var/log/ai-security-scanner
LOG_LEVEL=info
```

---

## 🔌 API Reference

### Check for Updates

**Endpoint:** `GET /api/updates/check`  
**Auth:** Required  
**Permission:** `updates:read`

```bash
curl -X GET https://api.example.com/api/updates/check \
  -H "Authorization: Bearer TOKEN"
```

**Response:**
```json
{
  "available": true,
  "count": 15,
  "manager": "apt",
  "updates": [...],
  "categorized": {
    "critical": [],
    "security": [...],
    "recommended": [],
    "optional": []
  }
}
```

### Install Updates

**Endpoint:** `POST /api/updates/install`  
**Auth:** Required  
**Permission:** `updates:write`

```bash
curl -X POST https://api.example.com/api/updates/install \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "packages": ["package1", "package2"],
    "createBackup": true,
    "autoRollback": true
  }'
```

**Response:**
```json
{
  "success": true,
  "operationId": "op-1234567890-abc123",
  "backupId": "backup-1234567890-def456",
  "rebootRequired": false,
  "timestamp": "2025-10-14T04:15:00.000Z"
}
```

### Rollback Update

**Endpoint:** `POST /api/updates/rollback`  
**Auth:** Required  
**Permission:** `updates:write`

```bash
curl -X POST https://api.example.com/api/updates/rollback \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"updateId": "op-1234567890-abc123"}'
```

### Get Update History

**Endpoint:** `GET /api/updates/history`  
**Auth:** Required  
**Permission:** `updates:read`

```bash
curl -X GET https://api.example.com/api/updates/history?limit=50 \
  -H "Authorization: Bearer TOKEN"
```

### Get/Update Configuration

**Endpoint:** `GET /api/updates/config`  
**Endpoint:** `PUT /api/updates/config`  
**Auth:** Required  
**Permission:** `updates:read` / `updates:write`

### Platform Information

**Endpoint:** `GET /api/updates/platforms`  
**Auth:** Required  
**Permission:** `updates:read`

**Response:**
```json
{
  "platform": "linux",
  "distro": "ubuntu",
  "arch": "x64",
  "packageManagers": ["apt", "snap", "docker"],
  "primaryPackageManager": "apt"
}
```

---

## 💡 Usage Examples

### Basic Update Check and Install

```javascript
// Check for updates
const updates = await fetch('/api/updates/check', {
  headers: { 'Authorization': 'Bearer TOKEN' }
});

// Install all updates
const result = await fetch('/api/updates/install', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    packages: [], // Empty = all updates
    createBackup: true,
    autoRollback: true
  })
});
```

### Install Specific Packages

```javascript
await fetch('/api/updates/install', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    packages: ['nginx', 'postgresql'],
    manager: 'apt',
    createBackup: true
  })
});
```

### Monitor Update Progress (WebSocket)

```javascript
const socket = io('https://api.example.com');

socket.on('update-notification', (notification) => {
  console.log('Update event:', notification.type);
  console.log('Data:', notification.data);
  
  switch(notification.type) {
    case 'update_started':
      // Show progress indicator
      break;
    case 'update_progress':
      // Update progress bar
      break;
    case 'update_completed':
      // Show success message
      break;
    case 'update_failed':
      // Show error message
      break;
  }
});
```

### Rollback Failed Update

```javascript
await fetch('/api/updates/rollback', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    updateId: 'op-1234567890-abc123'
  })
});
```

### Configure Auto-Updates

```javascript
await fetch('/api/updates/config', {
  method: 'PUT',
  headers: {
    'Authorization': 'Bearer TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    auto_check: true,
    auto_download: true,
    auto_install: false, // Still require manual approval
    check_interval: 86400, // 24 hours
    backup_before_update: true,
    notification_enabled: true
  })
});
```

---

## 🔒 Security

### Authentication & Authorization

All API endpoints require authentication and proper permissions:

- **updates:read** - Check updates, view history, view config
- **updates:write** - Install updates, rollback, modify config

### Cryptographic Verification

All downloaded updates are verified using:

1. **SHA-256/512 Checksums** - File integrity verification
2. **GPG Signatures** - Package authenticity verification (when available)

### Zero Telemetry

The update plugin respects your privacy:

- ❌ No usage tracking
- ❌ No anonymous statistics
- ❌ No crash reports sent
- ✅ All operations are local
- ✅ Update checks are anonymous
- ✅ Complete control over data

### Backup & Rollback

Every update can create a backup:

- Automatic backup before installation
- Package version tracking
- Safe rollback on failure
- Configurable retention period
- Size tracking and cleanup

### Tenant Isolation

Multi-tenant security:

- Complete data isolation between tenants
- Separate configurations per tenant
- Independent backup storage
- Isolated update operations

---

## 🐛 Troubleshooting

### Updates Not Detected

**Problem:** `checkForUpdates` returns 0 updates

**Solutions:**
1. Verify package manager is installed: `apt --version`
2. Update package lists manually: `sudo apt update`
3. Check platform detector: `GET /api/updates/platforms`
4. Review logs: `/var/log/ai-security-scanner/`

### Windows Update Not Working

**Problem:** Windows Update API not responding

**Solutions:**
1. Install PSWindowsUpdate module:
   ```powershell
   Install-Module PSWindowsUpdate -Force
   ```
2. Check PowerShell version (5.1+ required):
   ```powershell
   $PSVersionTable.PSVersion
   ```
3. Run as Administrator
4. Check Windows Update service is running

### Backup Creation Failed

**Problem:** Cannot create backup before update

**Solutions:**
1. Check disk space: `df -h`
2. Verify backup directory permissions
3. Check configuration: `backup_before_update` setting
4. Review backup directory: `/var/lib/ai-security-scanner/backups`

### Rollback Failed

**Problem:** Cannot rollback update

**Solutions:**
1. Verify backup exists: `GET /api/updates/history`
2. Check backup integrity
3. Ensure package downgrade is supported on your platform
4. Review rollback logs for specific errors

### Permission Denied

**Problem:** Package manager operations fail with permission errors

**Solutions:**
1. Ensure service runs with sufficient privileges
2. Check sudo configuration for passwordless operations
3. Verify SELinux/AppArmor policies (Linux)
4. Run as Administrator (Windows)

---

## 📊 Performance

### Resource Usage

- **Memory:** ~50-100 MB during operation
- **CPU:** Minimal (< 5%) during checks, higher during installation
- **Disk:** Backups require space based on package size
- **Network:** Depends on update size

### Optimization Tips

1. **Schedule Updates** - During low-traffic periods
2. **Limit Backups** - Configure retention period
3. **Cache Cleanup** - Regular package manager cache cleanup
4. **Notification Throttling** - Reduce WebSocket update frequency

---

## 🔄 Update Workflow

### Complete Update Process

1. **Check** - Query package manager for available updates
2. **Categorize** - Sort by critical, security, recommended, optional
3. **Notify** - Alert user of available updates
4. **Backup** - Create backup before installation
5. **Download** - Download update packages
6. **Verify** - Check checksums and signatures
7. **Install** - Install downloaded updates
8. **Verify** - Confirm installation success
9. **Rollback** - Auto-rollback if verification fails
10. **Notify** - Alert completion status
11. **History** - Record in update history
12. **Cleanup** - Clean old backups

---

## 📝 Development

### Adding New Package Manager

To add support for a new package manager:

1. Edit `package-manager-service.js`
2. Add manager configuration to `initializeManagers()`
3. Implement output parser method
4. Add to supported_package_managers in `plugin.json`
5. Test thoroughly

Example:
```javascript
'newmanager': {
  name: 'newmanager',
  platform: 'linux',
  commands: {
    update: 'newmanager refresh',
    upgrade: 'newmanager upgrade -y',
    install: (pkg) => `newmanager install ${pkg}`,
    list: 'newmanager list-updates'
  },
  parser: this.parseNewManagerOutput.bind(this)
}
```

---

## 📄 License

MIT License - See LICENSE file

---

## 🤝 Contributing

Contributions welcome! Please ensure:

1. All tests pass
2. Code follows existing style
3. Documentation is updated
4. Security best practices followed
5. Zero telemetry maintained

---

## 📞 Support

- GitHub Issues: https://github.com/yourusername/ai-security-scanner/issues
- Documentation: https://docs.ai-security-scanner.com
- Security Issues: security@ai-security-scanner.com

---

**Update Plugin v1.0.0** - Security-First Update Management  
Part of AI Security Scanner Project
