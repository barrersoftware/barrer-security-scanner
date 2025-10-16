# Test VPS Workflow Guide

Complete workflow for testing AI Security Scanner deployments on your OVHcloud test VPS.

## Quick Reference

```bash
# Deploy
sudo bash setup-noninteractive.sh --auto --skip-ssl --skip-postfix

# Test
curl http://localhost:3001

# Cleanup
bash cleanup-test.sh

# Repeat
```

## Initial Setup (One Time)

### 1. SSH Connection
Already configured with key authentication:
```bash
ssh test-vps
# or
ssh ubuntu@test.ssfdre38.xyz
```

### 2. First Deployment
```bash
# On main server, copy files to test VPS
rsync -avz --exclude 'node_modules' --exclude '.git' \
  ai-security-scanner/ test-vps:/home/ubuntu/ai-security-scanner/

# Deploy on test VPS
ssh test-vps 'cd /home/ubuntu/ai-security-scanner && \
  sudo bash setup-noninteractive.sh --auto --skip-ssl --skip-postfix'
```

## Testing Cycle

### Fast Iteration Workflow

```bash
# 1. Make changes on main server
cd /home/ubuntu/ai-security-scanner
# ... edit files ...

# 2. Cleanup test VPS
ssh test-vps 'bash /home/ubuntu/cleanup-test.sh'

# 3. Deploy updated code
rsync -avz --exclude 'node_modules' --exclude '.git' \
  ai-security-scanner/ test-vps:/home/ubuntu/ai-security-scanner/

# 4. Run setup (fast - deps already installed)
ssh test-vps 'cd /home/ubuntu/ai-security-scanner && \
  sudo bash setup-noninteractive.sh --auto --skip-ssl --skip-postfix'

# 5. Verify
ssh test-vps 'curl http://localhost:3001 && systemctl status ai-security-scanner'
```

### Manual Deployment (More Control)

```bash
# 1. Cleanup
ssh test-vps 'bash /home/ubuntu/cleanup-test.sh'

# 2. Copy files
rsync -avz --exclude 'node_modules' \
  ai-security-scanner/ test-vps:/home/ubuntu/ai-security-scanner/

# 3. Install dependencies
ssh test-vps 'cd /home/ubuntu/ai-security-scanner/web-ui && npm install'

# 4. Start manually
ssh test-vps 'cd /home/ubuntu/ai-security-scanner/web-ui && \
  nohup node server.js > /tmp/scanner.log 2>&1 &'

# 5. Check logs
ssh test-vps 'tail -f /tmp/scanner.log'
```

## Deployment Modes

### Mode 1: Automatic with Service
```bash
sudo bash setup-noninteractive.sh --auto --skip-ssl --skip-postfix
# Creates systemd service, auto-starts on boot
```

### Mode 2: With SSL (Self-Signed)
```bash
sudo bash setup-noninteractive.sh --auto --ssl-mode selfsigned --skip-postfix
# Good for testing SSL features
```

### Mode 3: Full Production Simulation
```bash
sudo bash setup-noninteractive.sh --auto \
  --ssl-mode letsencrypt \
  --domain test.ssfdre38.xyz \
  --email your@email.com \
  --postfix-mode internet
# Complete production-like setup
```

## Cleanup Options

### Quick Cleanup (Recommended)
```bash
# Fast, preserves Node.js and dependencies
bash cleanup-test.sh
```

### Complete Cleanup
```bash
# Removes everything except OS
sudo bash uninstall.sh --force --remove-nodejs --remove-postfix --remove-deps
```

### Nuclear Option (VPS Reset)
```bash
# In OVHcloud control panel: Reinstall VPS
# Takes ~5-10 minutes, gives 100% clean slate
```

## Testing Scenarios

### Scenario 1: Fresh Install Test
```bash
# 1. Complete cleanup
ssh test-vps 'sudo bash /home/ubuntu/ai-security-scanner/uninstall.sh --force --remove-nodejs'

# 2. Deploy from scratch
rsync -avz ai-security-scanner/ test-vps:/home/ubuntu/ai-security-scanner/
ssh test-vps 'cd /home/ubuntu/ai-security-scanner && \
  sudo bash setup-noninteractive.sh --auto --skip-ssl --skip-postfix'
```

### Scenario 2: Update Test
```bash
# 1. Quick cleanup (keeps deps)
ssh test-vps 'bash /home/ubuntu/cleanup-test.sh'

# 2. Deploy changes
rsync -avz ai-security-scanner/ test-vps:/home/ubuntu/ai-security-scanner/

# 3. Quick redeploy
ssh test-vps 'cd /home/ubuntu/ai-security-scanner && \
  sudo bash setup-noninteractive.sh --auto --skip-ssl --skip-postfix'
```

### Scenario 3: Feature Test
```bash
# 1. Deploy specific branch
git checkout feature-branch
rsync -avz ai-security-scanner/ test-vps:/home/ubuntu/ai-security-scanner/

# 2. Manual install and test
ssh test-vps 'cd /home/ubuntu/ai-security-scanner/web-ui && \
  npm install && node server.js'

# 3. Interactive testing
# Access http://test.ssfdre38.xyz:3001
```

## Verification Commands

### Check Installation
```bash
ssh test-vps 'ls -la /home/ubuntu/ai-security-scanner/web-ui'
```

### Check Service
```bash
ssh test-vps 'systemctl status ai-security-scanner'
```

### Check Processes
```bash
ssh test-vps 'ps aux | grep node'
```

### Check Logs
```bash
ssh test-vps 'tail -50 /tmp/scanner.log'
# or
ssh test-vps 'journalctl -u ai-security-scanner -n 50'
```

### Check Port
```bash
ssh test-vps 'netstat -tlnp | grep 3001'
```

### Test API
```bash
ssh test-vps 'curl -s http://localhost:3001/ | head -20'
```

## Performance Testing

### Resource Usage
```bash
ssh test-vps 'free -h && df -h && uptime'
```

### Process Stats
```bash
ssh test-vps 'ps aux --sort=-%mem | head -10'
```

### Network Stats
```bash
ssh test-vps 'netstat -s | grep -i tcp'
```

## Common Issues

### Port already in use
```bash
ssh test-vps 'sudo lsof -ti:3001 | xargs kill -9'
```

### Service won't start
```bash
ssh test-vps 'journalctl -u ai-security-scanner -n 100'
```

### Out of memory
```bash
ssh test-vps 'free -h && sync && echo 3 | sudo tee /proc/sys/vm/drop_caches'
```

### Disk full
```bash
ssh test-vps 'df -h && du -sh /home/ubuntu/* | sort -h'
```

## Automation Scripts

### One-Command Deploy
```bash
#!/bin/bash
# deploy-to-test.sh
rsync -avz --exclude 'node_modules' ai-security-scanner/ test-vps:/home/ubuntu/ai-security-scanner/
ssh test-vps 'bash /home/ubuntu/cleanup-test.sh && \
  cd /home/ubuntu/ai-security-scanner && \
  sudo bash setup-noninteractive.sh --auto --skip-ssl --skip-postfix'
```

### One-Command Cleanup
```bash
#!/bin/bash
# cleanup-test-vps.sh
ssh test-vps 'bash /home/ubuntu/cleanup-test.sh'
echo "Test VPS cleaned and ready for next deployment"
```

### Health Check
```bash
#!/bin/bash
# check-test-vps.sh
ssh test-vps '
echo "=== System ==="
uptime
free -h | grep Mem
df -h / | tail -1

echo -e "\n=== Service ==="
systemctl status ai-security-scanner --no-pager | head -5

echo -e "\n=== API ==="
curl -s http://localhost:3001/ | head -5
'
```

## Best Practices

1. **Always cleanup between tests** - Use `cleanup-test.sh` for speed
2. **Preserve dependencies** - Don't remove Node.js unless testing fresh install
3. **Use rsync** - Faster than git clone, excludes node_modules
4. **Check logs** - Always verify deployment with logs
5. **Test incrementally** - Small changes, quick iterations
6. **Document issues** - Note any problems for improvement
7. **Backup before major tests** - Can always restore if needed

## VPS Specifications

- **Provider:** OVHcloud VPS-2
- **IP:** 158.69.223.238
- **Domain:** test.ssfdre38.xyz
- **vCores:** 6
- **RAM:** 12 GB
- **Disk:** 100 GB
- **OS:** Ubuntu 24.04.3 LTS

## Cost Optimization

Since this is a paid VPS:
- Use quick cleanup to minimize reinstall time
- Keep frequently-used dependencies installed
- Stop service when not testing: `systemctl stop ai-security-scanner`
- Consider shutting down VPS when not in use (via OVHcloud panel)

## Next Steps

1. ✅ Test non-interactive deployment
2. ✅ Verify cleanup works
3. Test SSL modes
4. Test Postfix configurations
5. Performance benchmarking
6. Load testing
7. Security scanning
8. Documentation testing

## Support Files

- `setup-noninteractive.sh` - Automated setup
- `cleanup-test.sh` - Quick cleanup
- `uninstall.sh` - Complete removal
- `TEST_VPS_CONFIG.md` - Connection details
- `AUTOMATED_SETUP.md` - Setup documentation
- `UNINSTALL_GUIDE.md` - Cleanup documentation
