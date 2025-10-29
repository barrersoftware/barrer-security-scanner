#!/bin/bash
set -e

echo "========================================="
echo "AI Security Scanner Build"
echo "========================================="
echo ""

cd "$(dirname "$0")"
PROJECT_DIR="$(pwd)"
BUILD_OUTPUT="/mnt/projects/builds/packages"

echo "Project: AI Security Scanner"
echo "Directory: $PROJECT_DIR"
echo "Output: $BUILD_OUTPUT"
echo ""

mkdir -p "$BUILD_OUTPUT"

# Install dependencies if package.json exists
if [ -f "package.json" ]; then
    echo "Installing Node.js dependencies..."
    npm install
fi

if [ -f "requirements.txt" ]; then
    echo "Installing Python dependencies..."
    pip3 install -r requirements.txt
fi

# Run build if available
if [ -f "build.py" ]; then
    echo "Running Python build..."
    python3 build.py
elif [ -f "Makefile" ]; then
    echo "Running make..."
    make
fi

echo ""
echo "✓ AI Security Scanner build complete!"
echo "Build finished at: $(date)"
