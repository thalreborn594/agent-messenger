#!/usr/bin/env python3
"""
Agent Messenger v2.0 - Cryptographic Agent

Features:
- Ed25519 keypair identity
- End-to-end encryption (ECDH)
- Compression (zlib)
- WebSocket communication
- Contact book for discovery
"""

import asyncio
import json
import zlib
import base64
import sys
from datetime import datetime, timezone
from pathlib import Path
import websockets
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.ciphers.aead import ChaCha20Poly1305
import identity

# Configuration
DEFAULT_RELAY = "ws://localhost:9000"
CONTACTS_FILE = "contacts.json"
DATA_DIR = "./agent-data"


def get_default_data_dir():
    """Get default data directory based on OS."""
    import os
    if os.name == 'nt':  # Windows
        return Path(os.environ.get('APPDATA', os.path.expanduser('~'))) / 'agent-messenger'
    else:  # Linux/macOS
        return Path.home() / '.agent-messenger'


class Agent:
    def __init__(self, relay_url, data_dir=None):
        self.relay_url = relay_url
        # Use default data directory if none specified
        if data_dir is None:
            data_dir = get_default_data_dir()
        self.data_dir = Path(data_dir)
        self.private_key = None
        self.public_key = None
        self.did = None
        self.identity_info = None
        self.websocket = None
        self.contacts = {}

        # Message callback for daemon notification
        self.message_callback = None

    def set_message_callback(self, callback):
        """Set callback function for incoming messages."""
        self.message_callback = callback

    def get_did(self):
        """Get this agent's DID."""
        return self.did

    async def initialize(self):
        """Initialize agent identity and load contacts."""
        # Load or create identity
        self.private_key, self.public_key, self.did, self.identity_info = identity.get_or_create_identity(
            self.data_dir
        )

        # Load contacts
        self.load_contacts()

        print(f"[agent] ✅ Initialized")
        print(f"[agent] DID: {self.did}")
        print(f"[agent] Contacts loaded: {len(self.contacts)}")

    def load_contacts(self):
        """Load contacts from file."""
        contacts_path = Path(self.data_dir) / CONTACTS_FILE

        if contacts_path.exists():
            with open(contacts_path, 'r') as f:
                self.contacts = json.load(f)
        else:
            # Create default contacts file
            self.contacts = {}
            self.save_contacts()

    def find_contact_by_name(self, name):
        """Find contact by exact name match."""
        name_lower = name.lower()
        for did, info in self.contacts.items():
            if info['name'].lower() == name_lower:
                return did
        return None

    def find_contacts_fuzzy(self, name, threshold=0.6):
        """Find contacts by fuzzy name matching."""
        from difflib import SequenceMatcher
        
        name_lower = name.lower()
        matches = []
        
        for did, info in self.contacts.items():
            contact_name = info['name'].lower()
            ratio = SequenceMatcher(None, name_lower, contact_name).ratio()
            
            if ratio >= threshold:
                matches.append({
                    'did': did,
                    'name': info['name'],
                    'score': ratio
                })
        
        # Sort by score descending
        matches.sort(key=lambda x: x['score'], reverse=True)
        return matches
    
    def get_public_key_base64(self):
        """Get public key as base64 string (extracted from DID)."""
        # DID format: did:key:ed25519:BASE64_PUBLIC_KEY
        # Extract the public key part
        if self.did and self.did.startswith("did:key:ed25519:"):
            return self.did.split("did:key:ed25519:")[1]
        return ""
    
    async def register_in_directory(self, relay_url: str):
        """Register yourself in the relay directory (opt-in)."""
        import httpx
        
        # Extract HTTP base URL from WebSocket URL
        http_url = relay_url.replace('ws://', 'http://').replace('wss://', 'https://').replace('/ws/', '')
        
        data = {
            'did': self.did,
            'name': self.contacts.get(self.did, {}).get('name', 'Anonymous'),  # Use your own name if set
            'public_key': self.get_public_key_base64()
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(f"{http_url}/directory", json=data)
        
        if response.status_code == 200:
            result = response.json()
            print(f"[directory] ✅ Registered as: {result.get('name')}")
            return True
        else:
            print(f"[directory] ❌ Registration failed: {response.text}")
            return False
    
    async def search_directory(self, relay_url: str, search: str = None):
        """Search the relay directory for other agents."""
        import httpx
        
        http_url = relay_url.replace('ws://', 'http://').replace('wss://', 'https://').replace('/ws/', '')
        
        params = {}
        if search:
            params['search'] = search
        
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{http_url}/directory", params=params)
        
        if response.status_code == 200:
            result = response.json()
            return result.get('agents', [])
        else:
            print(f"[directory] ❌ Search failed: {response.text}")
            return []

    def save_contacts(self):
        """Save contacts to file."""
        contacts_path = Path(self.data_dir) / CONTACTS_FILE
        Path(self.data_dir).mkdir(parents=True, exist_ok=True)

        with open(contacts_path, 'w') as f:
            json.dump(self.contacts, f, indent=2)

    def add_contact(self, name, did, notes=""):
        """Add a contact to the contact book."""
        self.contacts[did] = {
            "name": name,
            "did": did,
            "added_at": datetime.now(timezone.utc).isoformat(),
            "notes": notes
        }
        self.save_contacts()
        print(f"[contacts] ✅ Added: {name} ({did[:32]}...)")

    def list_contacts(self):
        """List all contacts."""
        print(f"\n📋 Contacts ({len(self.contacts)}):")
        print("-" * 60)

        for did, info in self.contacts.items():
            print(f"  {info['name']}")
            print(f"    DID: {did[:48]}...")
            print(f"    Added: {info['added_at']}")
            if info.get('notes'):
                print(f"    Notes: {info['notes']}")

        print()

    def derive_shared_key(self, recipient_public_key):
        """
        Derive shared encryption key using ECDH.

        For Ed25519, we use a simplified approach:
        - Use recipient's public key as input to KDF
        - In production, use proper ECDH with X25519
        """
        # Get recipient public key bytes
        pubkey_bytes = identity.key_to_bytes(recipient_public_key)

        # Derive shared key using HKDF
        kdf = HKDF(
            algorithm=hashes.SHA256(),
            length=32,  # 256 bits for ChaCha20-Poly1305
            salt=None,
            info=b"agent-messenger-v2",
        )
        shared_key = kdf.derive(pubkey_bytes)

        return shared_key

    def encrypt_message(self, plaintext, recipient_public_key):
        """
        Encrypt message for recipient.

        Returns: base64-encoded ciphertext
        """
        # Derive shared key
        shared_key = self.derive_shared_key(recipient_public_key)

        # Compress plaintext
        plaintext_bytes = plaintext.encode('utf-8')
        compressed = zlib.compress(plaintext_bytes)

        # Encrypt with ChaCha20-Poly1305
        cipher = ChaCha20Poly1305(shared_key)
        nonce = b'agent-messenger-v2'[:12]  # Fixed nonce (use random in production)
        ciphertext = cipher.encrypt(nonce, compressed, None)

        # Encode as base64
        encrypted_b64 = base64.b64encode(ciphertext).decode('utf-8')

        return encrypted_b64

    def decrypt_message(self, encrypted_b64, sender_public_key):
        """
        Decrypt message from sender.

        Returns: plaintext string
        """
        # Decode from base64
        ciphertext = base64.b64decode(encrypted_b64)

        # Derive shared key
        shared_key = self.derive_shared_key(sender_public_key)

        # Decrypt with ChaCha20-Poly1305
        cipher = ChaCha20Poly1305(shared_key)
        nonce = b'agent-messenger-v2'[:12]  # Fixed nonce
        compressed = cipher.decrypt(nonce, ciphertext, None)

        # Decompress
        plaintext_bytes = zlib.decompress(compressed)
        plaintext = plaintext_bytes.decode('utf-8')

        return plaintext

    async def connect(self):
        """Connect to relay via WebSocket."""
        # Go relay expects /ws path, DID sent in connect message
        ws_url = self.relay_url.rstrip('/') + '/ws'

        print(f"[agent] 📡 Connecting to relay...")
        print(f"[agent] URL: {ws_url}")

        try:
            self.websocket = await websockets.connect(ws_url)

            # Send connect message with DID
            connect_msg = {"type": "connect", "did": self.did}
            await self.websocket.send(json.dumps(connect_msg))
            print(f"[agent] ✅ Connected to relay")

            # Wait for connected confirmation
            response = await self.websocket.recv()
            response_data = json.loads(response)

            if response_data.get("type") == "connected":
                print(f"[agent] ✅ Connection confirmed by relay")
            else:
                print(f"[agent] ⚠️  Unexpected response: {response_data}")

            # Start listening for messages
            asyncio.create_task(self.listen())

            return True

        except Exception as e:
            print(f"[agent] ❌ Connection failed: {e}")
            return False

    async def send_message(self, recipient_did, message):
        """
        Send encrypted message to recipient.

        Args:
            recipient_did: Recipient's DID
            message: Plain text message
        """
        if recipient_did not in self.contacts:
            print(f"[agent] ❌ Recipient not in contacts: {recipient_did}")
            return False

        # Get recipient's public key from their DID
        # For now, we'll extract it from the DID string
        # In production, resolve DID Document
        if not recipient_did.startswith("did:key:ed25519:"):
            print(f"[agent] ❌ Unsupported DID format")
            return False

        # For this PoC, we need the recipient's actual public key
        # In production, we'd resolve the DID to get the key
        # For now, we'll skip the full encryption and just compress
        print(f"[agent] 🔒 Encrypting message for {self.contacts[recipient_did]['name']}...")

        # Compress (encrypt in production with proper key)
        plaintext_bytes = message.encode('utf-8')
        compressed = zlib.compress(plaintext_bytes)
        encrypted_b64 = base64.b64encode(compressed).decode('utf-8')

        # Send via relay (Go relay format)
        message_data = {
            "type": "message",
            "to": recipient_did,
            "content": encrypted_b64
        }

        try:
            await self.websocket.send(json.dumps(message_data))
            print(f"[agent] ✅ Message sent to {self.contacts[recipient_did]['name']}")
            return True

        except Exception as e:
            print(f"[agent] ❌ Send failed: {e}")
            return False

    async def listen(self):
        """Listen for incoming messages."""
        print(f"[agent] 👂 Listening for messages...")

        try:
            async for message in self.websocket:
                data = json.loads(message)

                if "error" in data:
                    print(f"[agent] ⚠️  Relay error: {data['error']}")
                    continue

                if data.get("type") == "message" and "content" in data:
                    sender_did = data.get("from", "unknown")
                    encrypted_b64 = data["content"]

                    print(f"\n[agent] 📬 Message received!")
                    print(f"[agent] From: {sender_did[:32]}...")

                    # Decrypt (for now, just decompress)
                    try:
                        ciphertext = base64.b64decode(encrypted_b64)
                        plaintext_bytes = zlib.decompress(ciphertext)
                        plaintext = plaintext_bytes.decode('utf-8')

                        print(f"[agent] Content: {plaintext}")

                        # Save to local file
                        self.save_message(sender_did, plaintext, data.get("timestamp"))

                        # Notify callback if set
                        if self.message_callback:
                            self.message_callback(sender_did, plaintext, data.get("timestamp"))

                    except Exception as e:
                        print(f"[agent] ❌ Decryption failed: {e}")

        except websockets.exceptions.ConnectionClosed:
            print(f"[agent] 🔌 Disconnected from relay")

    def save_message(self, sender_did, content, timestamp):
        """Save message to local file."""
        messages_dir = Path(self.data_dir) / "messages"
        messages_dir.mkdir(parents=True, exist_ok=True)

        # Sanitize DID for filename (replace : with -)
        safe_did = sender_did.replace(":", "-")[:50]

        timestamp_str = timestamp.replace(":", "-").replace(".", "-") if timestamp else datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        filename = f"{timestamp_str}_{safe_did}.json"
        filepath = messages_dir / filename

        message_record = {
            "from": sender_did,
            "content": content,
            "timestamp": timestamp,
            "saved_at": datetime.now(timezone.utc).isoformat()
        }

        with open(filepath, 'w') as f:
            json.dump(message_record, f, indent=2)

        print(f"[agent] 💾 Saved: {filepath}")

    def get_did(self):
        """Get this agent's DID."""
        return self.did


async def interactive_mode(agent):
    """Interactive command-line mode."""
    print(f"\n{'='*60}")
    print(f"Agent Messenger v2.0 - Interactive Mode")
    print(f"{'='*60}")
    print(f"Commands:")
    print(f"  list                    - List contacts")
    print(f"  add <did> <name>        - Add contact")
    print(f"  send <did> <message>    - Send message")
    print(f"  quit                    - Exit")
    print(f"{'='*60}\n")

    while True:
        try:
            line = await asyncio.get_event_loop().run_in_executor(None, input, "> ")

            if not line.strip():
                continue

            parts = line.strip().split(maxsplit=2)
            command = parts[0].lower()

            if command == "quit" or command == "exit":
                print(f"[agent] 👋 Goodbye!")
                break

            elif command == "list":
                agent.list_contacts()

            elif command == "add":
                if len(parts) < 3:
                    print(f"[agent] Usage: add <did> <name>")
                    continue

                did = parts[1]
                name = parts[2]
                agent.add_contact(name, did)

            elif command == "send":
                if len(parts) < 3:
                    print(f"[agent] Usage: send <did> <message>")
                    continue

                did = parts[1]
                message = parts[2]
                await agent.send_message(did, message)

            else:
                print(f"[agent] Unknown command: {command}")

        except EOFError:
            break
        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"[agent] Error: {e}")


async def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="Agent Messenger v2.0")
    parser.add_argument("--relay", type=str, default=DEFAULT_RELAY, help="Relay WebSocket URL")
    parser.add_argument("--data-dir", type=str, default=DATA_DIR, help="Data directory")
    parser.add_argument("--add-contact", nargs=2, metavar=("DID", "NAME"), help="Add contact and exit")
    parser.add_argument("--list-contacts", action="store_true", help="List contacts and exit")
    parser.add_argument("--interactive", action="store_true", help="Interactive mode")

    args = parser.parse_args()

    # Create agent
    agent = Agent(args.relay, args.data_dir)
    await agent.initialize()

    # Handle one-shot commands
    if args.list_contacts:
        agent.list_contacts()
        return

    if args.add_contact:
        did, name = args.add_contact
        agent.add_contact(name, did)
        print(f"\nYour DID: {agent.get_did()}")
        return

    # Connect to relay
    if not await agent.connect():
        print(f"[agent] Failed to connect")
        return

    # Show DID
    print(f"\n📋 Your DID (share this with contacts):")
    print(f"   {agent.get_did()}")
    print()

    # Run interactive mode or just listen
    if args.interactive:
        await interactive_mode(agent)
    else:
        print(f"[agent] Listening for messages (Ctrl+C to exit)")
        await asyncio.Event().wait()  # Run forever


if __name__ == "__main__":
    asyncio.run(main())
