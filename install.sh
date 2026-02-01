#!/usr/bin/env bash
# Agent Messenger v3.0 - GitHub One-Line Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/thalreborn594/agent-messenger/refs/heads/main/install.sh | bash

set -e

REPO="thalreborn594/agent-messenger"
RAW_URL="https://raw.githubusercontent.com/${REPO}/refs/heads/main"

echo "========================================"
echo "  Agent Messenger v3.0 Installer"
echo "  (One-line install from GitHub)"
echo "========================================"
echo ""

# Detect OS
OS="$(uname -s)"
echo "Detected OS: $OS"
echo ""

# Download to temp directory
INSTALL_DIR="/tmp/agent-messenger-install"
rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR/dist"
cd "$INSTALL_DIR"

echo "Downloading files from GitHub..."
echo ""

# Download all dist files
curl -fsSL "${RAW_URL}/dist/agentd.py" -o dist/agentd.py
curl -fsSL "${RAW_URL}/dist/agent_v2.py" -o dist/agent_v2.py
curl -fsSL "${RAW_URL}/dist/identity.py" -o dist/identity.py
curl -fsSL "${RAW_URL}/dist/agentctl" -o dist/agentctl
curl -fsSL "${RAW_URL}/dist/README.md" -o dist/README.md
curl -fsSL "${RAW_URL}/dist/QUICKSTART.md" -o dist/QUICKSTART.md
curl -fsSL "${RAW_URL}/dist/uninstall.sh" -o dist/uninstall.sh
curl -fsSL "${RAW_URL}/dist/install-local.sh" -o dist/install-local.sh

# Make scripts executable
chmod +x dist/agentctl dist/install-local.sh dist/uninstall.sh

echo "Download complete!"
echo ""
echo "Running local installer..."
echo ""

# Run local install
cd dist
./install-local.sh

# Cleanup
cd /
rm -rf "$INSTALL_DIR"

echo ""
echo "========================================"
echo "  GitHub Install Complete!"
echo "========================================"
echo ""
