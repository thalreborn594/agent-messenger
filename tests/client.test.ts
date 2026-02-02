import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentClient } from '../src/client';
import { DID } from '../src/types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('AgentClient', () => {
  let client: AgentClient;
  let tempDir: string;
  const testRelayUrl = 'ws://localhost:9999';

  beforeEach(() => {
    // Create temp directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-test-'));
    client = new AgentClient(testRelayUrl, tempDir);
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Initialization', () => {
    it('should initialize client', async () => {
      await client.initialize();

      const did = client.getDID();

      expect(did).toBeTruthy();
      expect(did).toMatch(/^did:key:ed25519:/);

      // Check files were created
      expect(fs.existsSync(path.join(tempDir, 'identity.key'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'identity.json'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'contacts.json'))).toBe(true);
    });

    it('should load existing identity', async () => {
      await client.initialize();
      const did1 = client.getDID();

      // Create new client with same data dir
      const client2 = new AgentClient(testRelayUrl, tempDir);
      await client2.initialize();
      const did2 = client2.getDID();

      expect(did1).toBe(did2);
    });

    it('should create new identity if none exists', async () => {
      await client.initialize();
      const did1 = client.getDID();

      // Create new client with different data dir
      const tempDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-test2-'));
      const client2 = new AgentClient(testRelayUrl, tempDir2);
      await client2.initialize();
      const did2 = client2.getDID();

      expect(did1).not.toBe(did2);

      // Cleanup
      fs.rmSync(tempDir2, { recursive: true, force: true });
    });
  });

  describe('Contact Management', () => {
    beforeEach(async () => {
      await client.initialize();
    });

    it('should add a contact', () => {
      const testDID = 'did:key:ed25519:abc123def456ghi789' as DID;
      const testName = 'Test Agent';

      client.addContact(testName, testDID, 'Test notes');

      const contacts = client.getContacts();

      expect(contacts[testDID]).toBeDefined();
      expect(contacts[testDID].name).toBe(testName);
      expect(contacts[testDID].did).toBe(testDID);
      expect(contacts[testDID].notes).toBe('Test notes');
    });

    it('should save contacts to file', () => {
      const testDID = 'did:key:ed25519:abc123' as DID;
      const testName = 'Test Agent';

      client.addContact(testName, testDID);

      // Load contacts from file
      const contactsPath = path.join(tempDir, 'contacts.json');
      const contacts = JSON.parse(fs.readFileSync(contactsPath, 'utf-8'));

      expect(contacts[testDID]).toBeDefined();
      expect(contacts[testDID].name).toBe(testName);
    });

    it('should find contact by exact name', () => {
      const testDID = 'did:key:ed25519:abc123' as DID;
      const testName = 'Alice';

      client.addContact(testName, testDID);

      const foundDID = client.findContactByName('Alice');

      expect(foundDID).toBe(testDID);
    });

    it('should find contact case-insensitively', () => {
      const testDID = 'did:key:ed25519:abc123' as DID;
      const testName = 'Alice';

      client.addContact(testName, testDID);

      const foundDID1 = client.findContactByName('alice');
      const foundDID2 = client.findContactByName('ALICE');
      const foundDID3 = client.findContactByName('AlIcE');

      expect(foundDID1).toBe(testDID);
      expect(foundDID2).toBe(testDID);
      expect(foundDID3).toBe(testDID);
    });

    it('should return null for non-existent contact', () => {
      const foundDID = client.findContactByName('Nonexistent');

      expect(foundDID).toBeNull();
    });

    it('should find contacts by fuzzy match', () => {
      const did1 = 'did:key:ed25519:abc123' as DID;
      const did2 = 'did:key:ed25519:def456' as DID;

      client.addContact('Alice', did1);
      client.addContact('Alison', did2);

      const matches = client.findContactsFuzzy('alice');

      expect(matches.length).toBeGreaterThan(0);
      expect(matches.every(m => m.score >= 0.4)).toBe(true);
    });
  });

  describe('Message Storage', () => {
    beforeEach(async () => {
      await client.initialize();
      // Mock private saveMessage by accessing and calling it
      // For testing, we'll use public interface
    });

    it('should retrieve messages', async () => {
      // Manually create a message file
      const messagesDir = path.join(tempDir, 'messages');
      fs.mkdirSync(messagesDir, { recursive: true });

      const testMessage = {
        from: 'did:key:ed25519:abc123' as DID,
        content: 'Test message',
        timestamp: '2024-01-01T12:00:00Z',
        savedAt: '2024-01-01T12:00:00Z',
      };

      const filename = '20240101_120000_did-key-ed25519-abc123.json';
      fs.writeFileSync(path.join(messagesDir, filename), JSON.stringify(testMessage, null, 2));

      const messages = client.getMessages();

      expect(messages.length).toBe(1);
      expect(messages[0].content).toBe('Test message');
    });

    it('should limit messages', async () => {
      const messagesDir = path.join(tempDir, 'messages');
      fs.mkdirSync(messagesDir, { recursive: true });

      // Create 10 messages
      for (let i = 0; i < 10; i++) {
        const testMessage = {
          from: 'did:key:ed25519:abc123' as DID,
          content: `Message ${i}`,
          timestamp: `2024-01-01T12:0${i}:00Z`,
          savedAt: `2024-01-01T12:0${i}:00Z`,
        };

        const filename = `20240101_120${i}_did-key-ed25519-abc123.json`;
        fs.writeFileSync(path.join(messagesDir, filename), JSON.stringify(testMessage, null, 2));
      }

      const messages = client.getMessages(5);

      expect(messages.length).toBe(5);
    });

    it('should filter messages by sender', async () => {
      const messagesDir = path.join(tempDir, 'messages');
      fs.mkdirSync(messagesDir, { recursive: true });

      // Create messages from different senders
      const testMessage1 = {
        from: 'did:key:ed25519:alice' as DID,
        content: 'From Alice',
        timestamp: '2024-01-01T12:00:00Z',
        savedAt: '2024-01-01T12:00:00Z',
      };

      const testMessage2 = {
        from: 'did:key:ed25519:bob' as DID,
        content: 'From Bob',
        timestamp: '2024-01-01T12:01:00Z',
        savedAt: '2024-01-01T12:01:00Z',
      };

      const filename1 = '20240101_120000_did-key-ed25519-alice.json';
      const filename2 = '20240101_120100_did-key-ed25519-bob.json';

      fs.writeFileSync(path.join(messagesDir, filename1), JSON.stringify(testMessage1, null, 2));
      fs.writeFileSync(path.join(messagesDir, filename2), JSON.stringify(testMessage2, null, 2));

      const messagesFromAlice = client.getMessages(50, 'alice');
      const messagesFromBob = client.getMessages(50, 'bob');

      expect(messagesFromAlice.length).toBe(1);
      expect(messagesFromBob.length).toBe(1);
      expect(messagesFromAlice[0].content).toBe('From Alice');
      expect(messagesFromBob[0].content).toBe('From Bob');
    });
  });

  describe('Connection', () => {
    beforeEach(async () => {
      await client.initialize();
    });

    it('should initially not be connected', () => {
      expect(client.isConnected()).toBe(false);
    });

    it('should have correct relay URL', () => {
      expect((client as any).relayUrl).toBe(testRelayUrl);
    });
  });

  describe('DID', () => {
    it('should get DID after initialization', async () => {
      await client.initialize();

      const did = client.getDID();

      expect(did).toMatch(/^did:key:ed25519:/);
    });

    it('should get public key base64', async () => {
      await client.initialize();

      const publicKeyB64 = client.getPublicKeyBase64();

      expect(typeof publicKeyB64).toBe('string');
      expect(publicKeyB64.length).toBeGreaterThan(0);
    });
  });

  describe('Message Callback', () => {
    it('should set message callback', async () => {
      await client.initialize();

      let callbackCalled = false;
      const callback = () => {
        callbackCalled = true;
      };

      (client as any).setMessageCallback(callback);

      // Verify callback was set (access private property)
      expect((client as any).messageCallback).toBe(callback);
    });
  });
});
