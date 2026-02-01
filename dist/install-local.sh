#!/usr/bin/env bash
# Agent Messenger v3.0 - Linux Installer
# Installs daemon as systemd service and agentctl globally

set -e

echo "========================================"
echo "  Agent Messenger v3.0 Installer"
echo "========================================"
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$HOME/.agent-messenger"
BIN_DIR="$HOME/.local/bin"

# Create installation directory
echo "[1/6] Creating installation directory..."
if [ ! -d "$INSTALL_DIR" ]; then
    mkdir -p "$INSTALL_DIR"
    echo "     Created: $INSTALL_DIR"
else
    echo "     Exists:  $INSTALL_DIR"
fi
echo ""

# Create bin directory
echo "[2/6] Creating bin directory..."
if [ ! -d "$BIN_DIR" ]; then
    mkdir -p "$BIN_DIR"
    echo "     Created: $BIN_DIR"
else
    echo "     Exists:  $BIN_DIR"
fi
echo ""

# Copy files
echo "[3/6] Copying agent files..."
cp "$SCRIPT_DIR/agentd.py" "$INSTALL_DIR/"
echo "     agentd.py -> $INSTALL_DIR/"
cp "$SCRIPT_DIR/agent_v2.py" "$INSTALL_DIR/"
echo "     agent_v2.py -> $INSTALL_DIR/"
cp "$SCRIPT_DIR/identity.py" "$INSTALL_DIR/"
echo "     identity.py -> $INSTALL_DIR/"
cp "$SCRIPT_DIR/README.md" "$INSTALL_DIR/"
echo "     README.md -> $INSTALL_DIR/"
cp "$SCRIPT_DIR/QUICKSTART.md" "$INSTALL_DIR/"
echo "     QUICKSTART.md -> $INSTALL_DIR/"
echo ""

# Install agentctl globally
echo "[4/6] Installing agentctl globally..."
cp "$SCRIPT_DIR/agentctl" "$BIN_DIR/agentctl"
chmod +x "$BIN_DIR/agentctl"
echo "     agentctl -> $BIN_DIR/agentctl"
echo ""

# Add BIN_DIR to PATH if not present
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    echo "[4.5/6] Adding $BIN_DIR to PATH..."
    SHELL_CONFIG=""
    if [ -n "$ZSH_VERSION" ]; then
        SHELL_CONFIG="$HOME/.zshrc"
    elif [ -n "$BASH_VERSION" ]; then
        SHELL_CONFIG="$HOME/.bashrc"
    fi

    if [ -n "$SHELL_CONFIG" ]; then
        echo "" >> "$SHELL_CONFIG"
        echo "# Agent Messenger PATH" >> "$SHELL_CONFIG"
        echo "export PATH=\"$BIN_DIR:\$PATH\"" >> "$SHELL_CONFIG"
        echo "     Added to $SHELL_CONFIG"
    else
        echo "     ⚠️  Please manually add to PATH:"
        echo "        export PATH=\"$BIN_DIR:\$PATH\""
    fi
fi
echo ""

# Create systemd service file
echo "[5/6] Creating systemd service..."
SERVICE_FILE="/etc/systemd/system/agentd.service"

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Agent Messenger Daemon
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/python3 $INSTALL_DIR/agentd.py --relay wss://agent-relay.xyz
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

echo "     Service file: $SERVICE_FILE"
echo "     Relay URL: wss://agent-relay.xyz (public relay)"
echo ""

# Reload systemd and enable service
echo "[6/6] Enabling systemd service..."
sudo systemctl daemon-reload
sudo systemctl enable agentd
echo "     Service enabled"
echo ""

echo "========================================"
echo "  Installation Complete!"
echo "========================================"
echo ""
echo "Installation directory: $INSTALL_DIR"
echo "Binary directory:       $BIN_DIR"
echo ""
echo "IMPORTANT: If PATH was updated, run:"
echo "  source ~/.bashrc  # or source ~/.zshrc"
echo ""
echo "Commands (from anywhere):"
echo "  Check status:    sudo systemctl status agentd"
echo "  Start service:   sudo systemctl start agentd"
echo "  Stop service:    sudo systemctl stop agentd"
echo "  Restart service: sudo systemctl restart agentd"
echo "  View logs:       sudo journalctl -u agentd -f"
echo ""
echo "Agent commands (after sourcing):"
echo "  agentctl status"
echo "  agentctl register @username"
echo "  agentctl send @agent \"Hello!\""
echo ""
