#!/usr/bin/env python3
"""
Identity Management for Agent Messenger v2.0

Handles:
- Ed25519 keypair generation
- Persistent identity storage
- DID derivation from public key
- Signing and verification
"""

import json
import os
import base64
from pathlib import Path
from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend

IDENTITY_FILE = "identity.json"
KEY_FILE = "identity.key"


def generate_keypair():
    """Generate a new Ed25519 keypair."""
    private_key = ed25519.Ed25519PrivateKey.generate()
    public_key = private_key.public_key()
    return private_key, public_key


def key_to_bytes(key):
    """Convert key to bytes."""
    if isinstance(key, ed25519.Ed25519PrivateKey):
        return key.private_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PrivateFormat.Raw,
            encryption_algorithm=serialization.NoEncryption()
        )
    else:  # PublicKey
        return key.public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw
        )


def bytes_to_key(key_bytes, is_private=True):
    """Convert bytes back to key object."""
    if is_private:
        return ed25519.Ed25519PrivateKey.from_private_bytes(key_bytes)
    else:
        return ed25519.Ed25519PublicKey.from_public_bytes(key_bytes)


def derive_did(public_key):
    """
    Derive DID from public key.

    Using did:key method (simplified - proper implementation uses multicodec)
    Format: did:key:z<base58-public-key>
    """
    pubkey_bytes = key_to_bytes(public_key)

    # Simple base64 encoding for now (proper did:key uses base58btc)
    pubkey_b64 = base64.urlsafe_b64encode(pubkey_bytes).decode('utf-8').rstrip('=')

    # For production, use proper did:key multicodec encoding
    # For now: simplified format
    did = f"did:key:ed25519:{pubkey_b64}"

    return did


def get_or_create_identity(data_dir="."):
    """
    Load existing identity or create new one.

    Returns:
        (private_key, public_key, did, identity_info)
    """
    identity_path = Path(data_dir) / IDENTITY_FILE
    key_path = Path(data_dir) / KEY_FILE

    # Ensure data directory exists
    Path(data_dir).mkdir(parents=True, exist_ok=True)

    # Check if identity exists
    if identity_path.exists() and key_path.exists():
        # Load existing identity
        with open(identity_path, 'r') as f:
            identity_info = json.load(f)

        with open(key_path, 'rb') as f:
            private_key_bytes = f.read()
            private_key = bytes_to_key(private_key_bytes, is_private=True)
            public_key = private_key.public_key()

        print(f"[identity] ✅ Loaded existing identity")
        print(f"[identity] DID: {identity_info['did']}")

        return private_key, public_key, identity_info['did'], identity_info

    else:
        # Generate new identity
        print(f"[identity] 🔑 Generating new identity...")

        private_key, public_key = generate_keypair()
        did = derive_did(public_key)

        # Save key (binary)
        with open(key_path, 'wb') as f:
            f.write(key_to_bytes(private_key))
        os.chmod(key_path, 0o600)  # Read/write for owner only

        # Create identity info
        identity_info = {
            "did": did,
            "key_type": "Ed25519",
            "created_at": None,  # Will be set by caller
            "version": "2.0"
        }

        # Save identity info (JSON)
        with open(identity_path, 'w') as f:
            json.dump(identity_info, f, indent=2)

        print(f"[identity] ✅ New identity created")
        print(f"[identity] DID: {did}")

        return private_key, public_key, did, identity_info


def sign_message(private_key, message_bytes):
    """Sign a message with private key."""
    signature = private_key.sign(message_bytes)
    return signature


def verify_signature(public_key, message_bytes, signature):
    """Verify a signature with public key."""
    try:
        public_key.verify(signature, message_bytes)
        return True
    except Exception:
        return False


def get_identity_info(data_dir="."):
    """Get identity info without loading keys."""
    identity_path = Path(data_dir) / IDENTITY_FILE

    if identity_path.exists():
        with open(identity_path, 'r') as f:
            return json.load(f)
    else:
        return None


if __name__ == "__main__":
    # Test identity generation
    print("Testing identity generation...\n")

    private_key, public_key, did, info = get_or_create_identity("./test-identity")

    print(f"\n📋 Identity Info:")
    print(f"  DID: {did}")
    print(f"  Type: {info['key_type']}")
    print(f"  Version: {info['version']}")

    # Test signing/verification
    test_message = b"Hello, Agent World!"
    signature = sign_message(private_key, test_message)

    print(f"\n✍️  Signed test message")
    print(f"  Signature length: {len(signature)} bytes")

    is_valid = verify_signature(public_key, test_message, signature)
    print(f"\n✅ Signature verification: {'VALID' if is_valid else 'INVALID'}")

    # Test DID derivation is consistent
    private_key2, public_key2, did2, _ = get_or_create_identity("./test-identity")
    assert did == did2, "DID should be consistent!"
    print(f"\n✅ DID is consistent across reloads: {did}")
