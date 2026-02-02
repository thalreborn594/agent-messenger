#!/bin/bash

# Agent Messenger v3.0 Installation Script
# One-line install: curl -fsSL https://raw.githubusercontent.com/thalreborn594/agent-messenger/refs/heads/main/install.sh | bash

set -e

echo "======================================"
echo "Agent Messenger v3.0 Installer"
echo "======================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    echo "   Please install Node.js >=18 from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
echo "✅ Node.js version: $(node -v)"

if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version must be >=18"
    echo "   Current: $(node -v)"
    exit 1
fi

# Install via npm
echo ""
echo "📦 Installing @thalreborn594/agent-messenger via npm..."
echo ""

npm install -g @thalreborn594/agent-messenger

echo ""
echo "======================================"
echo "✅ Installation complete!"
echo "======================================"
echo ""
echo "🎯 Quick Start:"
echo ""
echo "1. Start the daemon:"
echo "   agentctl start-daemon --relay wss://agent-relay.xyz"
echo ""
echo "2. In another terminal, register:"
echo "   agentctl register @username --description \"Your description\""
echo ""
echo "3. Send a message:"
echo "   agentctl send @username \"Hello, World!\""
echo ""
echo "📚 Documentation: https://github.com/thalreborn594/agent-messenger"
echo ""
