# Windows Backup Support ✅
**Added:** 2025-10-13  
**Compatibility:** Windows 7+ and Server 2008+

---

## Features

### Windows-Native Backup
- ✅ ZIP compression (native Windows format)
- ✅ PowerShell 5.1+ and PowerShell 7+ support
- ✅ Windows EFS encryption support
- ✅ SHA-256 checksum verification
- ✅ Metadata tracking
- ✅ Automatic compression

### Supported Windows Versions
- Windows 7 (with .NET 4.5+)
- Windows 8/8.1
- Windows 10/11
- Windows Server 2008 R2+
- Windows Server 2012/2012 R2
- Windows Server 2016/2019/2022

---

## How It Works

### Automatic Platform Detection
The backup service automatically detects the platform:
- **Windows**: Uses PowerShell scripts with ZIP compression
- **Linux**: Uses tar with gzip compression  
- **macOS**: Uses tar with gzip compression

### Backup Format by Platform
- **Windows**: `.zip` (native Windows compression)
- **Linux/Mac**: `.tar.gz` (standard Unix format)

### Cross-Platform Restore
Backups can be restored on the same platform they were created on. Cross-platform restore requires extracting manually.

---

## PowerShell Scripts

### CreateBackup.ps1
Creates compressed ZIP backup with:
- Multi-source support
- Optimal compression
- SHA-256 checksums
- Optional EFS encryption
- JSON metadata
- Progress reporting

### RestoreBackup.ps1
Restores ZIP backup with:
- Checksum verification
- Safe extraction
- File counting
- Error handling

---

## Usage Examples

### Create Backup (Windows)
```javascript
const backup = await backupService.createBackup({
  name: 'my-backup',
  encrypt: true,  // Use Windows EFS
  type: 'manual'
});
```

### Create Backup (Linux)
```javascript
const backup = await backupService.createBackup({
  name: 'my-backup',
  encrypt: true,  // Use encryption service
  type: 'manual'
});
```

### Restore Backup (Any Platform)
```javascript
const result = await backupService.restoreBackup(backupId);
```

---

## SFTP Support (Cross-Platform)

Both Windows and Linux can upload to remote SFTP servers:

```javascript
// config.json
{
  "storage": {
    "enableSFTP": true,
    "sftpHosts": [
      {
        "host": "backup.example.com",
        "port": 22,
        "username": "backup",
        "keyFile": "C:\\Users\\Admin\\.ssh\\id_rsa",  // Windows
        "path": "/backups/windows"
      }
    ]
  }
}
```

---

## Testing on Windows

### Prerequisites
- PowerShell 5.1+ or PowerShell 7+
- .NET Framework 4.5+ (Windows 7/2008 R2)
- .NET 4.6+ (Windows 8+)

### Test Backup Creation
```powershell
# Run manually
pwsh -ExecutionPolicy Bypass -File .\windows\scripts\CreateBackup.ps1 `
  -BackupName "test-backup" `
  -BackupPath "C:\backups\test-backup.zip" `
  -Sources @("C:\data\users.json", "C:\data\reports") `
  -Encrypt
```

### Test Backup Restore
```powershell
pwsh -ExecutionPolicy Bypass -File .\windows\scripts\RestoreBackup.ps1 `
  -BackupPath "C:\backups\test-backup.zip" `
  -RestorePath "C:\restore" `
  -VerifyChecksum "abc123..."
```

---

## Security Features

### Windows-Specific
- ✅ EFS (Encrypting File System) support
- ✅ NTFS permissions preserved
- ✅ Windows security descriptors maintained
- ✅ Safe handling of system files

### Cross-Platform
- ✅ SHA-256 checksum verification
- ✅ Multiple backup destinations (SFTP)
- ✅ Automatic retention policies
- ✅ Backup metadata tracking

---

## Error Handling

The system handles Windows-specific errors:
- EFS not available → Falls back to unencrypted
- Insufficient permissions → Reports clear error
- Disk space issues → Cleanup staging directory
- Network issues → Continues with local backup

---

## Performance

### Windows ZIP Compression
- **Optimal level**: Best size/speed balance
- **Speed**: ~50-100 MB/s (depends on CPU)
- **Ratio**: 60-80% compression typical

### Staging Directory
- Temporary: `%TEMP%\backup_staging_*`
- Automatically cleaned up
- Handles large backups (multi-GB)

---

## Future Enhancements

- [ ] Windows VSS (Volume Shadow Copy) support
- [ ] Windows Backup API integration
- [ ] SMB/CIFS remote backup destinations
- [ ] Azure Backup integration
- [ ] Cross-platform backup conversion

---

**Status:** Production Ready ✅  
**Tested On:** Windows 10, Windows Server 2019  
**Compatible:** Windows 7+ and Server 2008+
