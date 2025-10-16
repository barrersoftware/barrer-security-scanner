#!/bin/bash
################################################################################
# Quick Test Environment Cleanup
# Fast cleanup for testing/development cycles
################################################################################

echo "🧹 Quick Test Cleanup"
echo "===================="

# Stop service
echo "Stopping service..."
sudo systemctl stop ai-security-scanner 2>/dev/null || true

# Kill processes
echo "Killing processes..."
sudo pkill -f "node.*server.js" 2>/dev/null || true

# Remove installation
echo "Removing installation..."
rm -rf /home/ubuntu/ai-security-scanner 2>/dev/null || true
rm -rf /home/$(whoami)/ai-security-scanner 2>/dev/null || true

# Remove service file
echo "Removing service..."
sudo rm -f /etc/systemd/system/ai-security-scanner.service
sudo systemctl daemon-reload 2>/dev/null || true

# Clean logs
echo "Cleaning logs..."
rm -f /tmp/scanner.log 2>/dev/null || true

echo ""
echo "✓ Cleanup complete!"
echo "  Node.js, Postfix, and dependencies preserved for next test"
echo ""
