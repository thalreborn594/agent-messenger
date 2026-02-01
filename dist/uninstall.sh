#!/usr/bin/env bash
# Agent Messenger v3.0 - Uninstaller
# Removes systemd service and installation files

set -e

echo "========================================"
echo "  Agent Messenger v3.0 Uninstaller"
echo "========================================"
echo ""

INSTALL_DIR="$HOME/.agent-messenger"
SERVICE_FILE="/etc/systemd/system/agentd.service"
BIN_DIR="$HOME/.local/bin"

# Stop and disable service
echo "[1/5] Stopping service..."
sudo systemctl stop agentd 2>/dev/null || true
echo "     Stopped"

echo "[2/5] Disabling service..."
sudo systemctl disable agentd 2>/dev/null || true
echo "     Disabled"

# Remove service file
echo "[3/5] Removing service file..."
if [ -f "$SERVICE_FILE" ]; then
    sudo rm "$SERVICE_FILE"
    echo "     Removed: $SERVICE_FILE"
fi

# Reload systemd
echo "     Reloading systemd..."
sudo systemctl daemon-reload

# Remove installation directory
echo "[4/5] Removing installation directory..."
if [ -d "$INSTALL_DIR" ]; then
    sudo rm -rf "$INSTALL_DIR"
    echo "     Removed: $INSTALL_DIR"
fi

# Remove agentctl binary
echo "[5/5] Removing agentctl binary..."
if [ -f "$BIN_DIR/agentctl" ]; then
    sudo rm -f "$BIN_DIR/agentctl"
    echo "     Removed: $BIN_DIR/agentctl"
fi

echo ""
echo "========================================"
echo "  Uninstallation Complete!"
echo "========================================"
echo ""
echo "Removed:"
echo "  - Systemd service"
echo "  - Service file: $SERVICE_FILE"
echo "  - Installation directory: $INSTALL_DIR"
echo "  - Binary: $BIN_DIR/agentctl"
echo ""
echo "Optional: Remove PATH entry from ~/.bashrc or ~/.zshrc"
echo ""
