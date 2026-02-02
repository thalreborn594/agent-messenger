/**
 * Utility functions for Agent Messenger v3.0
 * - File I/O operations
 * - Data directory management
 * - OS-specific paths
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { KeyPair, DID, ContactBook, StoredMessage, IdentityStorage } from './types';
import { generateKeyPair, deriveDID } from './crypto';

/**
 * Get platform-specific data directory
 */
export function getDataDir(customDir?: string): string {
  if (customDir) {
    return customDir;
  }

  const platform = os.platform();
  const homeDir = os.homedir();

  switch (platform) {
    case 'win32':
      return path.join(process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'), 'agent-messenger');
    case 'darwin':
      return path.join(homeDir, '.agent-messenger');
    default: // linux, freebsd, etc.
      return path.join(homeDir, '.agent-messenger');
  }
}

/**
 * Ensure directory exists, create if not
 */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  }
}

/**
 * Read JSON file safely
 */
export function readJSON<T>(filePath: string): T | null {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data) as T;
  } catch (error) {
    return null;
  }
}

/**
 * Write JSON file safely
 */
export function writeJSON<T>(filePath: string, data: T): void {
  const dir = path.dirname(filePath);
  ensureDir(dir);

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
}

/**
 * Save Ed25519 keypair to disk
 * - identity.key: binary private key (0o600)
 * - identity.json: public identity metadata
 */
export function saveKeypair(
  dataDir: string,
  keypair: KeyPair,
  did: DID
): void {
  const keyPath = path.join(dataDir, 'identity.key');
  const jsonPath = path.join(dataDir, 'identity.json');

  // Save private key (binary, restricted permissions)
  ensureDir(dataDir);
  fs.writeFileSync(keyPath, Buffer.from(keypair.privateKey), {
    mode: 0o600,
  });

  // Save public identity
  const identity: IdentityStorage = {
    did,
    public_key_b64: Buffer.from(keypair.publicKey).toString('base64'),
    created_at: new Date().toISOString(),
  };

  writeJSON(jsonPath, identity);
}

/**
 * Load Ed25519 keypair from disk
 */
export function loadKeypair(dataDir: string): { keypair: KeyPair; did: DID } | null {
  try {
    const keyPath = path.join(dataDir, 'identity.key');
    const jsonPath = path.join(dataDir, 'identity.json');

    // Load private key
    const privateKey = fs.readFileSync(keyPath);

    // Load public identity
    const identity = readJSON<IdentityStorage>(jsonPath);

    if (!identity) {
      return null;
    }

    // Derive public key from private key
    const { ed25519 } = require('@noble/curves/ed25519');
    const publicKey = ed25519.getPublicKey(privateKey);

    const keypair: KeyPair = {
      publicKey,
      privateKey: new Uint8Array(privateKey),
    };

    return {
      keypair,
      did: identity.did,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Get or create keypair
 */
export function getOrCreateKeypair(dataDir: string): { keypair: KeyPair; did: DID } {
  const existing = loadKeypair(dataDir);

  if (existing) {
    return existing;
  }

  // Generate new keypair
  const keypair = generateKeyPair();
  const did = deriveDID(keypair.publicKey);

  // Save to disk
  saveKeypair(dataDir, keypair, did);

  return { keypair, did };
}

/**
 * Load contacts from contacts.json
 */
export function loadContacts(dataDir: string): ContactBook {
  const contactsPath = path.join(dataDir, 'contacts.json');
  const contacts = readJSON<ContactBook>(contactsPath);

  return contacts || {};
}

/**
 * Save contacts to contacts.json
 */
export function saveContacts(dataDir: string, contacts: ContactBook): void {
  const contactsPath = path.join(dataDir, 'contacts.json');
  writeJSON(contactsPath, contacts);
}

/**
 * Sanitize DID for use in filename
 * Keeps only alphanumeric characters and underscores
 */
export function sanitizeDID(did: DID): string {
  return did.replace(/[^a-zA-Z0-9_]/g, '_');
}

/**
 * Save message to disk
 * Format: messages/{timestamp}_{sanitized_did}.json
 */
export function saveMessage(
  dataDir: string,
  from: DID,
  content: string,
  timestamp?: string
): void {
  const messagesDir = path.join(dataDir, 'messages');
  ensureDir(messagesDir);

  const msgTimestamp = timestamp || new Date().toISOString();
  const sanitized = sanitizeDID(from);
  const filename = `${msgTimestamp.replace(/[^0-9]/g, '')}_${sanitized}.json`;
  const filePath = path.join(messagesDir, filename);

  const message: StoredMessage = {
    from,
    content,
    timestamp: msgTimestamp,
    savedAt: new Date().toISOString(),
  };

  writeJSON(filePath, message);
}

/**
 * List all messages from disk
 */
export function listMessages(
  dataDir: string,
  options: { limit?: number; from?: DID } = {}
): StoredMessage[] {
  const messagesDir = path.join(dataDir, 'messages');

  if (!fs.existsSync(messagesDir)) {
    return [];
  }

  const files = fs.readdirSync(messagesDir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse(); // Newest first

  const messages: StoredMessage[] = [];

  for (const file of files) {
    if (options.limit && messages.length >= options.limit) {
      break;
    }

    const filePath = path.join(messagesDir, file);
    const message = readJSON<StoredMessage>(filePath);

    if (message) {
      // Filter by sender if specified
      if (options.from && message.from !== options.from) {
        continue;
      }

      messages.push(message);
    }
  }

  return messages;
}

/**
 * Find contact by name or DID
 */
export function findContact(
  dataDir: string,
  nameOrDID: string
): { did: DID; contact: any } | null {
  const contacts = loadContacts(dataDir);

  // Try exact DID match
  if (contacts[nameOrDID as DID]) {
    return {
      did: nameOrDID as DID,
      contact: contacts[nameOrDID as DID],
    };
  }

  // Try name match (case-insensitive)
  for (const [did, contact] of Object.entries(contacts)) {
    if (contact.name.toLowerCase() === nameOrDID.toLowerCase()) {
      return { did: did as DID, contact };
    }
  }

  return null;
}

/**
 * Get lock file path
 */
export function getLockFilePath(dataDir: string): string {
  return path.join(dataDir, 'daemon.lock');
}

/**
 * Check if daemon is running (lock file exists)
 */
export function isDaemonRunning(dataDir: string): boolean {
  const lockPath = getLockFilePath(dataDir);
  return fs.existsSync(lockPath);
}

/**
 * Create lock file
 */
export function createLockFile(dataDir: string, pid: number): void {
  const lockPath = getLockFilePath(dataDir);
  fs.writeFileSync(lockPath, pid.toString(), { mode: 0o600 });
}

/**
 * Remove lock file
 */
export function removeLockFile(dataDir: string): void {
  const lockPath = getLockFilePath(dataDir);

  if (fs.existsSync(lockPath)) {
    fs.unlinkSync(lockPath);
  }
}

/**
 * Get current timestamp in ISO 8601 format
 */
export function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Validate DID format
 */
export function isValidDID(did: string): boolean {
  return did.startsWith('did:key:ed25519:');
}

/**
 * Parse username from @username format
 */
export function parseUsername(username: string): string {
  if (username.startsWith('@')) {
    return username.slice(1);
  }
  return username;
}

/**
 * Format username with @ prefix
 */
export function formatUsername(username: string): string {
  if (username.startsWith('@')) {
    return username;
  }
  return `@${username}`;
}

/**
 * Base64 URL-safe encoding (no padding)
 */
export function base64UrlEncode(data: Uint8Array): string {
  const base64 = Buffer.from(data).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Base64 URL-safe decoding
 */
export function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');

  // Add padding if needed
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }

  return new Uint8Array(Buffer.from(base64, 'base64'));
}

/**
 * Format timestamp for filename
 */
export function formatTimestampForFile(timestamp?: string): string {
  if (timestamp) {
    return timestamp.replace(/[:.]/g, '-');
  }
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}_${hour}${minute}${second}`;
}

/**
 * Get current ISO timestamp
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Validate username format
 */
export function validateUsername(username: string): boolean {
  return /^@[a-zA-Z0-9_]{2,19}$/.test(username);
}
