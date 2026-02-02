/**
 * Tests for utility functions
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  getDataDir,
  ensureDir,
  readJSON,
  writeJSON,
  sanitizeDID,
  isValidDID,
  parseUsername,
  formatUsername,
  getTimestamp,
  getOrCreateKeypair,
  loadKeypair,
  saveContacts,
  loadContacts,
  saveMessage,
  listMessages,
} from '../src/utils';
import { generateKeyPair, deriveDID } from '../src/crypto';
import type { DID } from '../src/types';

describe('Data Directory', () => {
  it('should return platform-specific data directory', () => {
    const dataDir = getDataDir();

    expect(dataDir).toBeDefined();
    expect(typeof dataDir).toBe('string');

    if (os.platform() === 'win32') {
      expect(dataDir).toContain('agent-messenger');
    } else {
      expect(dataDir).toContain('.agent-messenger');
    }
  });

  it('should use custom data directory if provided', () => {
    const customDir = '/tmp/test-custom-dir';
    const dataDir = getDataDir(customDir);

    expect(dataDir).toBe(customDir);
  });
});

describe('Directory Operations', () => {
  const testDir = '/tmp/test-agent-messenger-utils';

  beforeEach(() => {
    // Cleanup before each test
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Cleanup after each test
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should create directory if it does not exist', () => {
    expect(fs.existsSync(testDir)).toBe(false);

    ensureDir(testDir);

    expect(fs.existsSync(testDir)).toBe(true);
    expect(fs.statSync(testDir).isDirectory()).toBe(true);
  });

  it('should not error if directory already exists', () => {
    ensureDir(testDir);
    ensureDir(testDir); // Should not error

    expect(fs.existsSync(testDir)).toBe(true);
  });
});

describe('JSON Operations', () => {
  const testFile = '/tmp/test-agent-messenger-utils/test.json';

  afterEach(() => {
    if (fs.existsSync(testFile)) {
      fs.unlinkSync(testFile);
    }
  });

  it('should write and read JSON', () => {
    const data = { name: 'test', value: 42 };
    writeJSON(testFile, data);

    const read = readJSON(testFile);

    expect(read).toEqual(data);
  });

  it('should return null for missing file', () => {
    const read = readJSON('/tmp/non-existent-file.json');

    expect(read).toBeNull();
  });

  it('should return null for invalid JSON', () => {
    fs.writeFileSync(testFile, 'invalid json');

    const read = readJSON(testFile);

    expect(read).toBeNull();
  });
});

describe('DID Sanitization', () => {
  it('should sanitize DID for filename', () => {
    const did = 'did:key:ed25519:x2oy5rm_Qide8289jr7ZPKrFM8VIjANb9CmQgKjBCpI' as DID;
    const sanitized = sanitizeDID(did);

    expect(sanitized).not.toContain(':');
    expect(sanitized).not.toContain('/');
  });

  it('should handle complex DIDs', () => {
    const did = 'did:key:ed25519:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_' as DID;
    const sanitized = sanitizeDID(did);

    expect(sanitized).toMatch(/^[A-Za-z0-9_]+$/);
  });
});

describe('DID Validation', () => {
  it('should validate valid DID', () => {
    const did = 'did:key:ed25519:test' as DID;

    expect(isValidDID(did)).toBe(true);
  });

  it('should reject invalid DID', () => {
    expect(isValidDID('invalid')).toBe(false);
    expect(isValidDID('did:key:rsa:test')).toBe(false);
    expect(isValidDID('')).toBe(false);
  });
});

describe('Username Parsing', () => {
  it('should parse username from @username', () => {
    expect(parseUsername('@test')).toBe('test');
  });

  it('should return username if already without @', () => {
    expect(parseUsername('test')).toBe('test');
  });

  it('should format username with @ prefix', () => {
    expect(formatUsername('test')).toBe('@test');
  });

  it('should not add @ if already present', () => {
    expect(formatUsername('@test')).toBe('@test');
  });
});

describe('Timestamp', () => {
  it('should return valid ISO 8601 timestamp', () => {
    const timestamp = getTimestamp();

    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('should return different timestamps', async () => {
    const timestamp1 = getTimestamp();
    // Small delay to ensure different timestamp
    await new Promise(resolve => setTimeout(resolve, 2));
    const timestamp2 = getTimestamp();

    expect(timestamp1).not.toBe(timestamp2);
  });
});

describe('Keypair Persistence', () => {
  const testDir = '/tmp/test-agent-messenger-keypairs';

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should save and load keypair', () => {
    // Create keypair
    const result1 = getOrCreateKeypair(testDir);
    expect(result1).toBeDefined();
    expect(result1.did).toBeDefined();
    expect(result1.keypair).toBeDefined();

    // Load keypair
    const result2 = loadKeypair(testDir);
    expect(result2).not.toBeNull();
    expect(result2?.did).toBe(result1.did);
  });

  it('should return null for missing keypair', () => {
    const result = loadKeypair(testDir);

    expect(result).toBeNull();
  });
});

describe('Contact Persistence', () => {
  const testDir = '/tmp/test-agent-messenger-contacts';

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should save and load contacts', () => {
    const contacts = {
      'did:key:ed25519:test1': {
        name: 'Agent 1',
        did: 'did:key:ed25519:test1' as DID,
        added_at: new Date().toISOString(),
      },
    };

    saveContacts(testDir, contacts);
    const loaded = loadContacts(testDir);

    expect(loaded).toEqual(contacts);
  });

  it('should return empty object for missing contacts', () => {
    const contacts = loadContacts(testDir);

    expect(contacts).toEqual({});
  });
});

describe('Message Persistence', () => {
  const testDir = '/tmp/test-agent-messenger-messages';

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should save and list messages', () => {
    const from = 'did:key:ed25519:test' as DID;
    const content = 'encrypted_content_here';

    saveMessage(testDir, from, content);
    const messages = listMessages(testDir);

    expect(messages.length).toBe(1);
    expect(messages[0].from).toBe(from);
    expect(messages[0].content).toBe(content);
  });

  it('should respect limit parameter', async () => {
    const from = 'did:key:ed25519:test' as DID;

    for (let i = 0; i < 10; i++) {
      saveMessage(testDir, from, `message_${i}`);
      // Small delay to ensure unique timestamps
      await new Promise(resolve => setTimeout(resolve, 1));
    }

    const messages = listMessages(testDir, { limit: 5 });

    expect(messages.length).toBe(5);
  });

  it('should filter by sender', () => {
    const from1 = 'did:key:ed25519:test1' as DID;
    const from2 = 'did:key:ed25519:test2' as DID;

    saveMessage(testDir, from1, 'message_from_1');
    saveMessage(testDir, from2, 'message_from_2');

    const messages1 = listMessages(testDir, { from: from1 });
    const messages2 = listMessages(testDir, { from: from2 });

    expect(messages1.length).toBe(1);
    expect(messages2.length).toBe(1);
    expect(messages1[0].from).toBe(from1);
    expect(messages2[0].from).toBe(from2);
  });

  it('should return empty array for missing messages', () => {
    const messages = listMessages(testDir);

    expect(messages).toEqual([]);
  });
});
