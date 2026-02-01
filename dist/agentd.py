#!/usr/bin/env python3
"""
Agent Messenger Daemon v3.0

Runs 24/7, maintains WebSocket connection to relay, exposes HTTP API for client commands.

Features:
- Default profile per device
- Lock file (single instance per profile)
- HTTP API for client commands
- Auto-reconnect on disconnect
- Background operation
"""

import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import uvicorn

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from agent_v2 import Agent
from identity import get_or_create_identity


# Configuration
DEFAULT_API_PORT = 5757


def get_default_data_dir():
    """Get default data directory based on OS."""
    if os.name == 'nt':  # Windows
        return Path(os.environ.get('APPDATA', os.path.expanduser('~'))) / 'agent-messenger'
    else:  # Linux/macOS
        return Path.home() / '.agent-messenger'


class LockFile:
    """Manage lock file to prevent multiple daemon instances."""

    def __init__(self, data_dir):
        self.data_dir = Path(data_dir)
        self.lock_file = self.data_dir / "daemon.lock"
        self.lock_fd = None

    def acquire(self):
        """Acquire lock. Returns False if already locked."""
        self.data_dir.mkdir(parents=True, exist_ok=True)

        try:
            # Try to create lock file exclusively (works on all platforms)
            self.lock_fd = open(self.lock_file, 'x')
            self.lock_fd.write(str(os.getpid()))
            self.lock_fd.flush()
            return True
        except FileExistsError:
            # Lock file exists, check if process is running
            try:
                with open(self.lock_file, 'r') as f:
                    pid = int(f.read().strip())

                # Try to send signal 0 to check if process exists
                os.kill(pid, 0)
                return False  # Process is running
            except OSError:
                # Process is dead, remove stale lock
                self.lock_file.unlink()
                return self.acquire()

    def release(self):
        """Release lock."""
        if self.lock_fd:
            self.lock_fd.close()
            self.lock_fd = None

        if self.lock_file.exists():
            self.lock_file.unlink()


# API Models
class SendMessageRequest(BaseModel):
    to: str = None
    to_name: str = None
    content: str


class AddContactRequest(BaseModel):
    did: str
    name: str
    notes: str = ""


# FastAPI app
app = FastAPI(title="Agent Messenger Daemon")

# Global agent instance
agent = None
lock = None


@app.on_event("startup")
async def startup():
    """Initialize agent and acquire lock."""
    global agent, lock

    import argparse
    parser = argparse.ArgumentParser(description="Agent Messenger Daemon")
    parser.add_argument("--relay", type=str, required=True, help="Relay WebSocket URL")
    parser.add_argument("--data-dir", type=str, default=None, help="Data directory")
    parser.add_argument("--api-port", type=int, default=DEFAULT_API_PORT, help="API port")
    parser.add_argument("--profile", type=str, default=None, help="Profile name (for multi-profile)")

    args = parser.parse_args()

    # Determine data directory
    if args.data_dir:
        data_dir = Path(args.data_dir)
    elif args.profile:
        data_dir = get_default_data_dir() / "profiles" / args.profile
    else:
        data_dir = get_default_data_dir()

    # Store for later access
    app.state.data_dir = data_dir
    app.state.relay_url = args.relay

    # Acquire lock
    lock = LockFile(data_dir)
    if not lock.acquire():
        print(f"[daemon] ❌ Another instance is already running for this profile")
        print(f"[daemon] Profile: {data_dir}")
        sys.exit(1)

    print(f"[daemon] 🔒 Lock acquired for profile: {data_dir}")

    # Initialize agent
    agent = Agent(args.relay, str(data_dir))
    await agent.initialize()

    # Connect to relay
    if not await agent.connect():
        print(f"[daemon] ❌ Failed to connect to relay")
        lock.release()
        sys.exit(1)

    print(f"[daemon] ✅ Daemon started")
    print(f"[daemon] Relay: {args.relay}")
    print(f"[daemon] API: http://localhost:{args.api_port}")
    print(f"[daemon] DID: {agent.get_did()}")


@app.on_event("shutdown")
async def shutdown():
    """Cleanup on shutdown."""
    global lock

    if agent and agent.websocket:
        await agent.websocket.close()

    if lock:
        lock.release()

    print(f"[daemon] ⏹️  Daemon stopped")


@app.get("/")
async def root():
    """Daemon status."""
    return {
        "service": "Agent Messenger Daemon",
        "version": "3.0",
        "status": "running",
        "did": agent.get_did() if agent else None,
        "connected": agent.websocket is not None if agent else False,
        "data_dir": str(app.state.data_dir) if hasattr(app.state, 'data_dir') else None
    }


@app.get("/status")
async def status():
    """Get detailed status."""
    if not agent:
        raise HTTPException(status_code=503, detail="Agent not initialized")

    # Count messages
    messages_dir = agent.data_dir / "messages"
    message_count = 0
    if messages_dir.exists():
        message_count = len([f for f in messages_dir.glob("*.json")])

    return {
        "did": agent.get_did(),
        "relay": agent.relay_url,
        "connected": agent.websocket is not None,
        "contacts": len(agent.contacts),
        "messages": message_count,
        "data_dir": str(agent.data_dir),
        "profile": app.state.data_dir.name if hasattr(app.state, 'data_dir') else "default"
    }


@app.post("/send")
async def send_message(request: SendMessageRequest):
    """Send a message."""
    if not agent:
        raise HTTPException(status_code=503, detail="Agent not initialized")

    if not agent.websocket:
        raise HTTPException(status_code=503, detail="Not connected to relay")

    # Check if sender is registered in directory
    try:
        import asyncio
        loop = asyncio.get_event_loop()

        def check_registration():
            import requests
            relay_http_url = agent.relay_url.replace('ws://', 'http://').replace('wss://', 'https://').replace('/ws', '')
            response = requests.get(f"{relay_http_url}/directory")
            if response.status_code == 200:
                data = response.json()
                agents = data.get('agents', [])
                # Check if our DID is in the directory
                for a in agents:
                    if a.get('did') == agent.get_did():
                        return True, a.get('username')
            return False, None

        is_registered, username = await loop.run_in_executor(None, check_registration)
        if not is_registered:
            raise HTTPException(
                status_code=403,
                detail="You must register a username before sending messages. Use: agentctl register @yourname"
            )
    except Exception as e:
        # If we can't check registration, allow sending (relay will handle it)
        pass

    # Reload contacts to ensure sync
    agent.load_contacts()

    # Resolve recipient
    recipient_did = None

    if request.to:
        recipient_did = request.to
    elif request.to_name:
        # Try exact match first
        recipient_did = agent.find_contact_by_name(request.to_name)

        # If no exact match, try fuzzy search
        if not recipient_did:
            matches = agent.find_contacts_fuzzy(request.to_name)

            if matches:
                # Use best match
                best_match = matches[0]
                return JSONResponse(
                    status_code=300,
                    content={
                        "status": "ambiguous_name",
                        "message": f"No exact match for '{request.to_name}'. Did you mean:",
                        "suggestions": [
                            f"{m['name']} (DID: {m['did']}, similarity: {int(m['score']*100)}%)"
                            for m in matches[:3]
                        ]
                    }
                )
            else:
                raise HTTPException(
                    status_code=404,
                    detail=f"Contact not found: {request.to_name}"
                )
    else:
        raise HTTPException(status_code=400, detail="Must specify 'to' or 'to_name'")

    success = await agent.send_message(recipient_did, request.content)

    if success:
        return {"status": "sent", "to": recipient_did, "to_name": request.to_name}
    else:
        raise HTTPException(status_code=500, detail="Failed to send message")


@app.post("/add-contact")
async def add_contact(request: AddContactRequest):
    """Add a contact."""
    if not agent:
        raise HTTPException(status_code=503, detail="Agent not initialized")

    agent.add_contact(request.name, request.did, request.notes)

    return {
        "status": "added",
        "did": request.did,
        "name": request.name
    }


@app.get("/contacts")
async def list_contacts():
    """List all contacts."""
    if not agent:
        raise HTTPException(status_code=503, detail="Agent not initialized")

    contacts_list = []
    for did, info in agent.contacts.items():
        contacts_list.append({
            "did": did,
            "name": info["name"],
            "added_at": info.get("added_at"),
            "notes": info.get("notes", "")
        })

    return {"contacts": contacts_list}


@app.get("/messages")
async def list_messages(limit: int = 50, from_filter: str = None):
    """List recent messages with optional 'from' filter."""
    if not agent:
        raise HTTPException(status_code=503, detail="Agent not initialized")

    # Build a mapping of username to DID if filtering by username
    username_to_did = {}
    if from_filter and from_filter.startswith('@'):
        try:
            import asyncio
            loop = asyncio.get_event_loop()

            def get_directory():
                import requests
                relay_http_url = agent.relay_url.replace('ws://', 'http://').replace('wss://', 'https://').replace('/ws', '')
                response = requests.get(f"{relay_http_url}/directory")
                if response.status_code == 200:
                    data = response.json()
                    mapping = {}
                    for a in data.get('agents', []):
                        mapping[a.get('username', '')] = a.get('did', '')
                    return mapping
                return {}

            username_to_did = await loop.run_in_executor(None, get_directory)
        except Exception as e:
            print(f"[directory] ⚠️  Could not query directory: {e}")

    messages_dir = agent.data_dir / "messages"
    messages = []

    if messages_dir.exists():
        message_files = sorted(messages_dir.glob("*.json"), reverse=True)

        for msg_file in message_files:
            import json
            with open(msg_file, 'r') as f:
                msg = json.load(f)

                # Apply from filter if specified
                if from_filter:
                    sender_did = msg.get('from', '')

                    # If filtering by username (@username)
                    if from_filter.startswith('@'):
                        if sender_did != username_to_did.get(from_filter, ''):
                            continue
                    # If filtering by DID
                    elif from_filter.lower() not in sender_did.lower():
                        continue

                messages.append(msg)

            # Stop if we've reached the limit
            if len(messages) >= limit:
                break

    return {"messages": messages, "count": len(messages)}


@app.post("/disconnect")
async def disconnect():
    """Disconnect from relay (for testing)."""
    if agent and agent.websocket:
        await agent.websocket.close()
        agent.websocket = None

    return {"status": "disconnected"}


@app.post("/reconnect")
async def reconnect():
    """Reconnect to relay."""
    if not agent:
        raise HTTPException(status_code=503, detail="Agent not initialized")

    success = await agent.connect()

    if success:
        return {"status": "connected"}
    else:
        raise HTTPException(status_code=500, detail="Failed to connect")


# ==================== Directory Endpoints ====================

@app.post("/register")
async def register_in_directory(request: dict):
    """
    Register username and profile in relay directory.

    Body:
        {
            "username": "@username",
            "description": "What I do",  // optional
            "purpose": "Why to contact me",  // optional
            "tags": ["ai", "coding"]  // optional
        }
    """
    if not agent:
        raise HTTPException(status_code=503, detail="Agent not initialized")

    username = request.get('username', '').strip()
    description = request.get('description', '').strip()
    purpose = request.get('purpose', '').strip()
    tags = request.get('tags', [])

    if not username:
        raise HTTPException(status_code=400, detail="Username is required")

    # Validate username format
    import re
    if not re.match(r'^@[a-zA-Z0-9_]{2,19}$', username):
        raise HTTPException(
            status_code=400,
            detail="Invalid username format. Must start with @, 3-20 chars, alphanumeric + underscore only"
        )

    # Build registration data
    # Provide defaults for required fields (relay requires non-empty values)
    if not description:
        description = "Agent Messenger user"
    if not purpose:
        purpose = "General communication"

    data = {
        'username': username,
        'did': agent.get_did(),
        'public_key': agent.get_public_key_base64(),
        'description': description,
        'purpose': purpose,
        'tags': tags
    }

    # Register with relay (use requests in async context)
    relay_http_url = agent.relay_url.replace('ws://', 'http://').replace('wss://', 'https://').replace('/ws', '')

    try:
        import asyncio
        loop = asyncio.get_event_loop()

        def sync_request():
            import requests
            response = requests.post(f"{relay_http_url}/directory/register", json=data)
            return response

        response = await loop.run_in_executor(None, sync_request)

        if response.status_code == 200:
            result = response.json()
            return {
                "status": "registered",
                "message": f"Registered username '{username}' in directory",
                "username": username,
                "did": result.get('did')
            }
        elif response.status_code == 409:
            error_json = response.json()
            error_detail = error_json.get('detail') or error_json.get('error', 'Username already taken')
            raise HTTPException(status_code=409, detail=error_detail)
        else:
            error_json = response.json()
            error_detail = error_json.get('detail') or error_json.get('error', 'Unknown error')
            raise HTTPException(status_code=500, detail=f"Registration failed: {error_detail}")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Registration error: {str(e)}")


@app.get("/directory")
async def get_directory(search: str = None):
    """Get agent directory from relay."""
    if not agent:
        raise HTTPException(status_code=503, detail="Agent not initialized")

    relay_http_url = agent.relay_url.replace('ws://', 'http://').replace('wss://', 'https://').replace('/ws', '')

    try:
        import asyncio
        loop = asyncio.get_event_loop()

        def sync_request():
            import requests
            params = {}
            if search:
                params['search'] = search
            response = requests.get(f"{relay_http_url}/directory", params=params)
            return response

        response = await loop.run_in_executor(None, sync_request)

        if response.status_code == 200:
            return response.json()
        else:
            raise HTTPException(status_code=500, detail=f"Query failed: {response.text}")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query error: {str(e)}")


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="Agent Messenger Daemon v3.0")
    parser.add_argument("--relay", type=str, required=True, help="Relay WebSocket URL")
    parser.add_argument("--data-dir", type=str, default=None, help="Data directory (default: OS-specific)")
    parser.add_argument("--api-port", type=int, default=DEFAULT_API_PORT, help="API port (default: 5757)")
    parser.add_argument("--profile", type=str, default=None, help="Profile name (creates separate profile)")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="API host (default: 127.0.0.1)")

    args = parser.parse_args()

    print(f"""
    ╔══════════════════════════════════════════╗
    ║   Agent Messenger Daemon v3.0            ║
    ╠══════════════════════════════════════════╣
    ║ Relay: {args.relay}
    ║ API: http://{args.host}:{args.api_port}
    ║ Profile: {args.profile or 'default'}
    ╚══════════════════════════════════════════╝

    Starting daemon...
    """)

    # Run FastAPI
    uvicorn.run(
        app,
        host=args.host,
        port=args.api_port,
        log_level="info"
    )


if __name__ == "__main__":
    main()
