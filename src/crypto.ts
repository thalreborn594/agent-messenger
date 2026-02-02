import { ed25519 } from '@noble/curves/ed25519';
import { chacha20poly1305 } from '@noble/ciphers/chacha';
import { hkdfSync } from 'crypto';
import { KeyPair, DID } from './types';
import { base64UrlEncode, base64UrlDecode } from './utils';
import * as zlib from 'zlib';

const HKDF_INFO = Buffer.from('agent-messenger-v2');
const NONCE = Buffer.from('agent-messenger-v2').slice(0, 12); // First 12 bytes

/**
 * Generate Ed25519 key pair
 */
export function generateKeyPair(): KeyPair {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);

  return {
    privateKey: new Uint8Array(privateKey),
    publicKey: new Uint8Array(publicKey),
  };
}

/**
 * Derive DID from public key
 * Format: did:key:ed25519:BASE64_URLSAFE_NO_PADDING
 */
export function deriveDID(publicKey: Uint8Array): DID {
  const pubkeyB64 = base64UrlEncode(publicKey);
  return `did:key:ed25519:${pubkeyB64}` as DID;
}

/**
 * Sign message with private key
 */
export function signMessage(privateKey: Uint8Array, message: Uint8Array): Uint8Array {
  const signature = ed25519.sign(message, privateKey);
  return new Uint8Array(signature);
}

/**
 * Verify signature with public key
 */
export function verifySignature(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array
): boolean {
  try {
    return ed25519.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}

/**
 * Derive shared key using HKDF
 * Uses recipient's public key as input material
 */
export function deriveSharedKey(recipientPublicKey: Uint8Array): Uint8Array {
  const sharedKey = hkdfSync('sha256', Buffer.from(recipientPublicKey), Buffer.alloc(0), Buffer.from(HKDF_INFO), 32);
  return new Uint8Array(sharedKey);
}

/**
 * Extract public key from DID
 */
export function extractPublicKeyFromDID(did: DID): Uint8Array {
  if (!did.startsWith('did:key:ed25519:')) {
    throw new Error('Invalid DID format');
  }

  const b64Part = did.split('did:key:ed25519:')[1];
  return base64UrlDecode(b64Part);
}

/**
 * Compress data using zlib
 */
export function compress(data: Uint8Array): Uint8Array {
  return new Uint8Array(zlib.deflateSync(data));
}

/**
 * Decompress data using zlib
 */
export function decompress(data: Uint8Array): Uint8Array {
  return new Uint8Array(zlib.inflateSync(data));
}

/**
 * Encrypt message for recipient
 * Returns: base64-encoded ciphertext
 */
export function encryptMessage(
  plaintext: string,
  recipientPublicKey: Uint8Array
): string {
  // Derive shared key
  const sharedKey = deriveSharedKey(recipientPublicKey);

  // Compress plaintext
  const plaintextBytes = Buffer.from(plaintext, 'utf-8');
  const compressed = compress(plaintextBytes);

  // Encrypt with ChaCha20-Poly1305
  const cipher = chacha20poly1305(sharedKey, NONCE);
  const ciphertext = cipher.encrypt(compressed);

  // Encode as base64 (standard base64, not URL-safe - matches Python)
  const encryptedB64 = Buffer.from(ciphertext).toString('base64');

  return encryptedB64;
}

/**
 * Decrypt message from sender
 * Returns: plaintext string
 */
export function decryptMessage(
  encryptedB64: string,
  senderPublicKey: Uint8Array
): string {
  // Decode from base64
  const ciphertext = Buffer.from(encryptedB64, 'base64');

  // Derive shared key
  const sharedKey = deriveSharedKey(senderPublicKey);

  // Decrypt with ChaCha20-Poly1305
  const cipher = chacha20poly1305(sharedKey, NONCE);
  const compressed = cipher.decrypt(ciphertext);

  // Decompress
  const plaintextBytes = decompress(compressed);
  const plaintext = Buffer.from(plaintextBytes).toString('utf-8');

  return plaintext;
}
