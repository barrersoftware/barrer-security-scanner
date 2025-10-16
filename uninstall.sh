#!/bin/bash
################################################################################
# AI Security Scanner - Uninstall Script
# Removes all components and restores clean environment
# Version: 1.0.0
################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Options
REMOVE_NODEJS=false
REMOVE_POSTFIX=false
REMOVE_DEPS=false
FORCE=false

usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Uninstall AI Security Scanner and optionally remove dependencies

OPTIONS:
    --remove-nodejs     Also remove Node.js and npm
    --remove-postfix    Also remove Postfix mail server
    --remove-deps       Also remove system dependencies
    --force             Skip confirmation prompts
    -h, --help          Show this help message

EXAMPLES:
    # Basic uninstall (keeps Node.js, Postfix, deps)
    sudo bash $0

    # Complete removal including Node.js
    sudo bash $0 --remove-nodejs --remove-postfix --remove-deps

    # Force removal without prompts
    sudo bash $0 --force --remove-nodejs --remove-postfix

EOF
    exit 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --remove-nodejs)
            REMOVE_NODEJS=true
            shift
            ;;
        --remove-postfix)
            REMOVE_POSTFIX=true
            shift
            ;;
        --remove-deps)
            REMOVE_DEPS=true
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            usage
            ;;
    esac
done

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_section() {
    echo ""
    echo -e "${BLUE}▶ $1${NC}"
    echo ""
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    print_error "Please run as root (use sudo)"
    exit 1
fi

# Banner
clear
cat << "EOF"
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║           AI SECURITY SCANNER UNINSTALLER                       ║
║           Clean Environment Restoration                          ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
EOF
echo ""

# Confirmation
if [ "$FORCE" = false ]; then
    print_warning "This will remove AI Security Scanner from your system"
    echo ""
    echo "  Will remove:"
    echo "    - AI Security Scanner service"
    echo "    - Installation directory"
    echo "    - Configuration files"
    echo "    - Log files"
    echo ""
    
    if [ "$REMOVE_NODEJS" = true ]; then
        echo "    - Node.js and npm"
    fi
    
    if [ "$REMOVE_POSTFIX" = true ]; then
        echo "    - Postfix mail server"
    fi
    
    if [ "$REMOVE_DEPS" = true ]; then
        echo "    - System dependencies (curl, wget, git, etc.)"
    fi
    
    echo ""
    read -p "Are you sure you want to continue? (yes/no): " confirm
    
    if [ "$confirm" != "yes" ]; then
        print_info "Uninstall cancelled"
        exit 0
    fi
fi

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
elif [ "$(uname)" = "Darwin" ]; then
    OS="macos"
else
    print_error "Unsupported operating system"
    exit 1
fi

# Stop and disable service
print_section "Stopping Service"

if systemctl is-active --quiet ai-security-scanner 2>/dev/null; then
    systemctl stop ai-security-scanner
    print_success "Service stopped"
fi

if systemctl is-enabled --quiet ai-security-scanner 2>/dev/null; then
    systemctl disable ai-security-scanner
    print_success "Service disabled"
fi

# Remove systemd service file
if [ -f /etc/systemd/system/ai-security-scanner.service ]; then
    rm -f /etc/systemd/system/ai-security-scanner.service
    systemctl daemon-reload
    print_success "Service file removed"
fi

# Kill any running processes
print_section "Stopping Running Processes"

pkill -f "node.*server.js" 2>/dev/null || true
pkill -f "ai-security-scanner" 2>/dev/null || true
print_success "Processes stopped"

# Remove installation directory
print_section "Removing Installation Files"

INSTALL_DIRS=(
    "/home/$(logname)/ai-security-scanner"
    "/opt/ai-security-scanner"
    "/usr/local/ai-security-scanner"
)

for dir in "${INSTALL_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        rm -rf "$dir"
        print_success "Removed: $dir"
    fi
done

# Remove log files
print_section "Removing Log Files"

rm -f /tmp/scanner.log
rm -f /var/log/ai-security-scanner*.log
print_success "Log files removed"

# Remove configuration files
print_section "Removing Configuration Files"

rm -rf /etc/ai-security-scanner
rm -f ~/.ai-security-scanner*
print_success "Configuration files removed"

# Remove SSL certificates (if self-signed)
if [ -d "/home/$(logname)/ai-security-scanner/ssl" ]; then
    rm -rf "/home/$(logname)/ai-security-scanner/ssl"
    print_success "SSL certificates removed"
fi

# Remove Node.js if requested
if [ "$REMOVE_NODEJS" = true ]; then
    print_section "Removing Node.js"
    
    case "$OS" in
        ubuntu|debian)
            apt-get remove -y nodejs npm
            apt-get autoremove -y
            rm -rf /etc/apt/sources.list.d/nodesource.list
            rm -f /usr/share/keyrings/nodesource.gpg
            print_success "Node.js removed"
            ;;
        centos|rhel|fedora)
            yum remove -y nodejs npm
            rm -f /etc/yum.repos.d/nodesource*.repo
            print_success "Node.js removed"
            ;;
        arch)
            pacman -Rns --noconfirm nodejs npm
            print_success "Node.js removed"
            ;;
        macos)
            if command -v brew &> /dev/null; then
                brew uninstall node
                print_success "Node.js removed"
            fi
            ;;
    esac
fi

# Remove Postfix if requested
if [ "$REMOVE_POSTFIX" = true ]; then
    print_section "Removing Postfix"
    
    case "$OS" in
        ubuntu|debian)
            systemctl stop postfix 2>/dev/null || true
            apt-get remove -y postfix
            apt-get autoremove -y
            print_success "Postfix removed"
            ;;
        centos|rhel|fedora)
            systemctl stop postfix 2>/dev/null || true
            yum remove -y postfix
            print_success "Postfix removed"
            ;;
    esac
fi

# Remove dependencies if requested
if [ "$REMOVE_DEPS" = true ]; then
    print_section "Removing System Dependencies"
    
    case "$OS" in
        ubuntu|debian)
            apt-get remove -y curl wget git build-essential
            apt-get autoremove -y
            print_success "Dependencies removed"
            ;;
        centos|rhel|fedora)
            yum remove -y curl wget git gcc-c++ make
            print_success "Dependencies removed"
            ;;
        arch)
            pacman -Rns --noconfirm curl wget git base-devel
            print_success "Dependencies removed"
            ;;
    esac
fi

# Clean up package cache
print_section "Cleaning Package Cache"

case "$OS" in
    ubuntu|debian)
        apt-get clean
        apt-get autoclean
        print_success "Cache cleaned"
        ;;
    centos|rhel|fedora)
        yum clean all
        print_success "Cache cleaned"
        ;;
    arch)
        pacman -Sc --noconfirm
        print_success "Cache cleaned"
        ;;
esac

# Summary
print_section "Uninstall Complete"

print_success "AI Security Scanner has been completely removed"
echo ""
print_info "System Status:"
echo "  - Service: Removed"
echo "  - Installation: Cleaned"
echo "  - Logs: Removed"
echo "  - Configuration: Removed"

if [ "$REMOVE_NODEJS" = true ]; then
    echo "  - Node.js: Removed"
fi

if [ "$REMOVE_POSTFIX" = true ]; then
    echo "  - Postfix: Removed"
fi

if [ "$REMOVE_DEPS" = true ]; then
    echo "  - Dependencies: Removed"
fi

echo ""
print_info "Your system has been restored to a clean state"
echo ""

exit 0
