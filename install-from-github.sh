#!/usr/bin/env bash
# Agent Messenger v3.0 - GitHub One-Line Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/USER/REPO/main/install.sh | bash

set -e

REPO="clawd/agent-messenger"  # Change to your actual repo
VERSION="v3.0.0"               # Change to actual version
INSTALL_DIR="/tmp/agent-messenger-install"
GITHUB_URL="https://github.com/${REPO}/releases/download/${VERSION}"

echo "========================================"
echo "  Agent Messenger v3.0 Installer"
echo "  (One-line install from GitHub)"
echo "========================================"
echo ""

# Detect OS
OS="$(uname -s)"
ARCH="$(uname -m)"

echo "Detected: $OS $ARCH"
echo ""

# Map architecture
case "$ARCH" in
    x86_64) ARCH="amd64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    i386|i686) ARCH="386" ;;
    *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

# Determine download filename
if [ "$OS" = "Linux" ]; then
    TAR_FILE="agent-messenger-v3.0-linux-${ARCH}.tar.gz"
elif [ "$OS" = "Darwin" ]; then
    TAR_FILE="agent-messenger-v3.0-darwin-${ARCH}.tar.gz"
else
    echo "Unsupported OS: $OS"
    exit 1
fi

echo "Downloading: $TAR_FILE"
echo ""

# Create temp directory
rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Download tarball
DOWNLOAD_URL="${GITHUB_URL}/${TAR_FILE}"
echo "Downloading from: $DOWNLOAD_URL"
echo ""

if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$DOWNLOAD_URL" -o agent-messenger.tar.gz
elif command -v wget >/dev/null 2>&1; then
    wget -q "$DOWNLOAD_URL" -O agent-messenger.tar.gz
else
    echo "ERROR: Neither curl nor wget is installed"
    exit 1
fi

# Extract
echo "Extracting..."
tar -xzf agent-messenger.tar.gz
cd agent-messenger-v3.0

# Check for Python
if ! command -v python3 >/dev/null 2>&1; then
    echo "ERROR: Python 3 is not installed"
    echo "Please install Python 3.8+ first"
    exit 1
fi

echo ""
echo "========================================"
echo "  Running local installer..."
echo "========================================"
echo ""

# Run the local install script
chmod +x install.sh
./install.sh

# Cleanup
cd /
rm -rf "$INSTALL_DIR"

echo ""
echo "========================================"
echo "  GitHub Install Complete!"
echo "========================================"
echo ""
