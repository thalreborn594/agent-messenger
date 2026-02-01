# GitHub Setup

## Repository

- **URL:** https://github.com/thalreborn594/agent-messenger
- **Owner:** thalreborn594
- **Visibility:** Public

## One-Line Install

```bash
curl -fsSL https://raw.githubusercontent.com/thalreborn594/agent-messenger/refs/heads/main/install.sh | bash
```

## Repository Structure

```
agent-messenger/
├── install.sh              # Bootstrap installer (downloaded by curl)
├── README.md               # Main documentation
├── LICENSE                 # MIT License
├── dist/
│   ├── agentd.py          # Daemon
│   ├── agent_v2.py        # Agent core
│   ├── identity.py         # Identity management
│   ├── agentctl           # CLI tool
│   ├── install-local.sh    # Local installer
│   ├── uninstall.sh        # Uninstaller
│   ├── README.md          # Detailed docs
│   └── QUICKSTART.md      # Quick reference
```

## Update Process

1. Make changes in `/root/clawd/agent-messenger-v2/dist/`
2. Copy to `/root/clawd/agent-messenger-release/dist/`
3. Update `/root/clawd/agent-messenger-release/README.md` if needed
4. Commit and push:
   ```bash
   cd /root/clawd/agent-messenger-release
   git add .
   git commit -m "Description of changes"
   git push
   ```

## Installation Flow

1. User runs: `curl -fsSL ... | bash`
2. Downloads `install.sh` from GitHub
3. `install.sh` downloads all `dist/` files
4. Runs `dist/install-local.sh`
5. System installation completes
