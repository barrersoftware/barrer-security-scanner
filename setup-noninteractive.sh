#!/bin/bash
################################################################################
# AI Security Scanner - Non-Interactive Setup Script
# Compatible with: Ubuntu, Debian, CentOS, RHEL, Fedora, Arch, macOS
# Version: 4.0.0
################################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Default values
AUTO_MODE=false
SKIP_SSL=false
SKIP_POSTFIX=false
SSL_MODE=""
DOMAIN=""
EMAIL=""
PORT=3001
POSTFIX_MODE="local"

# Usage function
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Non-interactive setup script for AI Security Scanner

OPTIONS:
    -a, --auto              Automatic mode (skip all prompts)
    -s, --skip-ssl          Skip SSL setup
    -p, --skip-postfix      Skip Postfix setup
    --ssl-mode MODE         SSL mode: letsencrypt, selfsigned, existing, skip
    --domain DOMAIN         Domain name for Let's Encrypt
    --email EMAIL           Email for Let's Encrypt
    --port PORT             Server port (default: 3001)
    --postfix-mode MODE     Postfix mode: local, internet, smarthost, satellite, none (default: local)
    -h, --help              Show this help message

EXAMPLES:
    # Full automatic setup with defaults
    sudo bash $0 --auto --skip-ssl --skip-postfix

    # Setup with Let's Encrypt SSL
    sudo bash $0 --auto --ssl-mode letsencrypt --domain example.com --email admin@example.com

    # Setup with self-signed SSL
    sudo bash $0 --auto --ssl-mode selfsigned

    # Setup with Postfix (internet mode)
    sudo bash $0 --auto --postfix-mode internet --skip-ssl

EOF
    exit 0
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -a|--auto)
            AUTO_MODE=true
            shift
            ;;
        -s|--skip-ssl)
            SKIP_SSL=true
            shift
            ;;
        -p|--skip-postfix)
            SKIP_POSTFIX=true
            shift
            ;;
        --ssl-mode)
            SSL_MODE="$2"
            shift 2
            ;;
        --domain)
            DOMAIN="$2"
            shift 2
            ;;
        --email)
            EMAIL="$2"
            shift 2
            ;;
        --port)
            PORT="$2"
            shift 2
            ;;
        --postfix-mode)
            POSTFIX_MODE="$2"
            shift 2
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
    echo -e "${CYAN}▶ $1${NC}"
    echo ""
}

# Banner
clear
cat << "EOF"
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║           AI SECURITY SCANNER v4.0.0                            ║
║           Non-Interactive Setup Script                           ║
║                                                                  ║
║           Automated Deployment Made Easy                         ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
EOF

echo ""
print_info "Mode: $([ "$AUTO_MODE" = true ] && echo "AUTOMATIC" || echo "STANDARD")"
echo ""

# Detect OS
print_section "Detecting Operating System"

if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    OS_VERSION=$VERSION_ID
    OS_NAME=$PRETTY_NAME
elif [ "$(uname)" = "Darwin" ]; then
    OS="macos"
    OS_NAME="macOS"
else
    print_error "Unsupported operating system"
    exit 1
fi

print_info "Detected: $OS_NAME"
print_info "Architecture: $(uname -m)"

# Check Node.js
print_section "Checking Node.js Installation"

if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    print_success "Node.js $NODE_VERSION installed"
    
    if command -v npm &> /dev/null; then
        NPM_VERSION=$(npm --version)
        print_success "npm $NPM_VERSION installed"
    else
        print_error "npm not found"
        exit 1
    fi
else
    print_info "Installing Node.js..."
    
    case "$OS" in
        ubuntu|debian)
            export DEBIAN_FRONTEND=noninteractive
            curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
            apt-get install -y nodejs
            ;;
        centos|rhel|fedora)
            curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
            yum install -y nodejs
            ;;
        arch)
            pacman -Sy --noconfirm nodejs npm
            ;;
        macos)
            if command -v brew &> /dev/null; then
                brew install node
            else
                print_error "Homebrew not found. Please install it first."
                exit 1
            fi
            ;;
        *)
            print_error "Unsupported OS for automatic Node.js installation"
            exit 1
            ;;
    esac
    
    print_success "Node.js installed"
fi

# Install dependencies
print_section "Installing System Dependencies"

case "$OS" in
    ubuntu|debian)
        export DEBIAN_FRONTEND=noninteractive
        apt-get update -qq
        apt-get install -y -qq curl wget git build-essential
        print_success "Dependencies installed"
        ;;
    centos|rhel|fedora)
        yum install -y curl wget git gcc-c++ make
        print_success "Dependencies installed"
        ;;
    arch)
        pacman -Sy --noconfirm curl wget git base-devel
        print_success "Dependencies installed"
        ;;
    macos)
        if ! command -v brew &> /dev/null; then
            print_warning "Homebrew not found, skipping optional dependencies"
        fi
        print_success "Dependencies check complete"
        ;;
esac

# Setup Postfix if not skipped
if [ "$SKIP_POSTFIX" = false ] && [ "$POSTFIX_MODE" != "none" ]; then
    print_section "Setting Up Postfix Mail Server"
    
    case "$OS" in
        ubuntu|debian)
            export DEBIAN_FRONTEND=noninteractive
            
            # Preconfigure postfix
            case "$POSTFIX_MODE" in
                internet)
                    echo "postfix postfix/main_mailer_type select Internet Site" | debconf-set-selections
                    echo "postfix postfix/mailname string $(hostname -f)" | debconf-set-selections
                    ;;
                smarthost)
                    echo "postfix postfix/main_mailer_type select Internet with smarthost" | debconf-set-selections
                    echo "postfix postfix/mailname string $(hostname -f)" | debconf-set-selections
                    ;;
                satellite)
                    echo "postfix postfix/main_mailer_type select Satellite system" | debconf-set-selections
                    echo "postfix postfix/mailname string $(hostname -f)" | debconf-set-selections
                    ;;
                *)
                    echo "postfix postfix/main_mailer_type select Local only" | debconf-set-selections
                    echo "postfix postfix/mailname string $(hostname -f)" | debconf-set-selections
                    ;;
            esac
            
            apt-get install -y -qq postfix
            systemctl enable postfix
            systemctl restart postfix
            print_success "Postfix installed and configured (Mode: $POSTFIX_MODE)"
            ;;
        centos|rhel|fedora)
            yum install -y postfix
            systemctl enable postfix
            systemctl start postfix
            print_success "Postfix installed"
            ;;
    esac
else
    print_info "Skipping Postfix installation"
fi

# Install AI Security Scanner
print_section "Installing AI Security Scanner"

INSTALL_DIR="/home/$(logname)/ai-security-scanner"

if [ -d "$INSTALL_DIR/web-ui" ]; then
    print_info "Installation directory exists, updating..."
    cd "$INSTALL_DIR/web-ui"
else
    print_info "Creating installation directory..."
    mkdir -p "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    
    # Assume files are already present or copy them
    if [ ! -f "package.json" ]; then
        print_error "AI Security Scanner files not found in $INSTALL_DIR"
        exit 1
    fi
fi

# Install Node.js packages
print_section "Installing Node.js Packages"

if [ -f "web-ui/package.json" ]; then
    cd web-ui
    npm install --silent
    print_success "Dependencies installed"
    cd ..
else
    print_error "package.json not found"
    exit 1
fi

# Setup SSL
if [ "$SKIP_SSL" = false ] && [ -n "$SSL_MODE" ]; then
    print_section "Setting Up SSL"
    
    case "$SSL_MODE" in
        letsencrypt)
            if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
                print_error "Domain and email required for Let's Encrypt"
                exit 1
            fi
            
            # Install certbot
            case "$OS" in
                ubuntu|debian)
                    apt-get install -y certbot
                    ;;
                centos|rhel|fedora)
                    yum install -y certbot
                    ;;
            esac
            
            # Get certificate
            certbot certonly --standalone -d "$DOMAIN" --email "$EMAIL" --agree-tos --non-interactive
            print_success "Let's Encrypt certificate obtained"
            ;;
            
        selfsigned)
            mkdir -p ssl
            openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
                -keyout ssl/key.pem -out ssl/cert.pem \
                -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
            print_success "Self-signed certificate created"
            ;;
            
        skip)
            print_info "Skipping SSL setup"
            ;;
    esac
fi

# Create systemd service
print_section "Creating Systemd Service"

cat > /etc/systemd/system/ai-security-scanner.service << ENDSERVICE
[Unit]
Description=AI Security Scanner
After=network.target

[Service]
Type=simple
User=$(logname)
WorkingDirectory=$INSTALL_DIR/web-ui
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=$PORT

[Install]
WantedBy=multi-user.target
ENDSERVICE

systemctl daemon-reload
systemctl enable ai-security-scanner
systemctl start ai-security-scanner

print_success "Service created and started"

# Final status
print_section "Installation Complete"

print_success "AI Security Scanner installed successfully!"
echo ""
print_info "Service Status:"
systemctl status ai-security-scanner --no-pager -l | head -10
echo ""
print_info "Access the dashboard at: http://localhost:$PORT"
print_info "Create an admin user at: http://localhost:$PORT/setup.html"
echo ""
print_warning "Default credentials for testing:"
print_warning "  Username: admin"
print_warning "  Password: Change this immediately!"
echo ""

exit 0
