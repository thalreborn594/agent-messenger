import WebSocket from 'ws';
import { DID, Contact, ContactBook, MessageCallback, WSMessage } from './types';
import { generateKeyPair, deriveDID, extractPublicKeyFromDID, encryptMessage, decryptMessage } from './crypto';
import { getDataDir as getDefaultDataDir, sanitizeDID, formatTimestampForFile, getCurrentTimestamp, ensureDir, sleep } from './utils';
import * as fs from 'fs';
import * as path from 'path';

const CONTACTS_FILE = 'contacts.json';
const IDENTITY_FILE = 'identity.json';
const KEY_FILE = 'identity.key';

export class AgentClient {
  private relayUrl: string;
  private dataDir: string;
  private privateKey: Uint8Array | null = null;
  private publicKey: Uint8Array | null = null;
  private did: DID | null = null;
  private contacts: ContactBook = {};
  private ws: WebSocket | null = null;
  private messageCallback: MessageCallback | null = null;
  private messageQueue: Array<{ to: DID; content: string; timestamp: string }> = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 2000; // Start at 2 seconds
  private isConnecting = false;

  constructor(relayUrl: string, dataDir?: string) {
    this.relayUrl = relayUrl;
    this.dataDir = dataDir || getDefaultDataDir();
  }

  /**
   * Initialize agent identity and load contacts
   */
  async initialize(): Promise<void> {
    ensureDir(this.dataDir);

    // Load or create identity
    await this.loadOrCreateIdentity();

    // Load contacts
    this.loadContacts();

    console.log(`[agent] ✅ Initialized`);
    console.log(`[agent] DID: ${this.did}`);
    console.log(`[agent] Contacts loaded: ${Object.keys(this.contacts).length}`);
  }

  /**
   * Load existing identity or create new one
   */
  private async loadOrCreateIdentity(): Promise<void> {
    const identityPath = path.join(this.dataDir, IDENTITY_FILE);
    const keyPath = path.join(this.dataDir, KEY_FILE);

    if (fs.existsSync(identityPath) && fs.existsSync(keyPath)) {
      // Load existing identity
      const identityInfo = JSON.parse(fs.readFileSync(identityPath, 'utf-8'));
      const privateKeyBytes = fs.readFileSync(keyPath);
      this.privateKey = new Uint8Array(privateKeyBytes);

      // Derive public key from private
      const { ed25519 } = await import('@noble/curves/ed25519');
      this.publicKey = new Uint8Array(ed25519.getPublicKey(this.privateKey));

      this.did = identityInfo.did as DID;

      console.log(`[identity] ✅ Loaded existing identity`);
      console.log(`[identity] DID: ${this.did}`);
    } else {
      // Generate new identity
      console.log(`[identity] 🔑 Generating new identity...`);

      const keypair = generateKeyPair();
      this.privateKey = keypair.privateKey;
      this.publicKey = keypair.publicKey;
      this.did = deriveDID(this.publicKey);

      // Save key (binary)
      fs.writeFileSync(keyPath, Buffer.from(this.privateKey));
      fs.chmodSync(keyPath, 0o600); // Read/write for owner only

      // Create identity info
      const identityInfo = {
        did: this.did,
        keyType: 'Ed25519',
        createdAt: getCurrentTimestamp(),
        version: '3.0',
      };

      fs.writeFileSync(identityPath, JSON.stringify(identityInfo, null, 2));

      console.log(`[identity] ✅ New identity created`);
      console.log(`[identity] DID: ${this.did}`);
    }
  }

  /**
   * Load contacts from file
   */
  private loadContacts(): void {
    const contactsPath = path.join(this.dataDir, CONTACTS_FILE);

    if (fs.existsSync(contactsPath)) {
      this.contacts = JSON.parse(fs.readFileSync(contactsPath, 'utf-8'));
    } else {
      this.contacts = {};
      this.saveContacts();
    }
  }

  /**
   * Save contacts to file
   */
  private saveContacts(): void {
    const contactsPath = path.join(this.dataDir, CONTACTS_FILE);
    ensureDir(this.dataDir);
    fs.writeFileSync(contactsPath, JSON.stringify(this.contacts, null, 2));
  }

  /**
   * Set callback for incoming messages
   */
  setMessageCallback(callback: MessageCallback): void {
    this.messageCallback = callback;
  }

  /**
   * Get this agent's DID
   */
  getDID(): DID | null {
    return this.did;
  }

  /**
   * Get contacts
   */
  getContacts(): ContactBook {
    return { ...this.contacts };
  }

  /**
   * Find contact by exact name match
   */
  findContactByName(name: string): DID | null {
    const nameLower = name.toLowerCase();
    for (const [did, info] of Object.entries(this.contacts)) {
      if (info.name.toLowerCase() === nameLower) {
        return did as DID;
      }
    }
    return null;
  }

  /**
   * Find contacts by fuzzy name matching
   */
  findContactsFuzzy(name: string, threshold = 0.3): Array<{ did: DID; name: string; score: number }> {
    const nameLower = name.toLowerCase();
    const matches: Array<{ did: DID; name: string; score: number }> = [];

    for (const [did, info] of Object.entries(this.contacts)) {
      const contactName = info.name.toLowerCase();
      const ratio = this.calculateSimilarity(nameLower, contactName);

      if (ratio >= threshold) {
        matches.push({
          did: did as DID,
          name: info.name,
          score: ratio,
        });
      }
    }

    // Sort by score descending
    matches.sort((a, b) => b.score - a.score);
    return matches;
  }

  /**
   * Calculate similarity ratio between two strings (Levenshtein distance)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1;
    if (str1.length === 0 || str2.length === 0) return 0;

    const matrix: number[][] = Array(str2.length + 1)
      .fill(null)
      .map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) {
      matrix[0][i] = i;
    }

    for (let j = 0; j <= str2.length; j++) {
      matrix[j][0] = j;
    }

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }

    const distance = matrix[str2.length][str1.length];
    const maxLength = Math.max(str1.length, str2.length);
    return 1 - distance / maxLength;
  }

  /**
   * Add a contact
   */
  addContact(name: string, did: DID, notes = ''): void {
    this.contacts[did] = {
      name,
      did,
      addedAt: getCurrentTimestamp(),
      notes,
    };
    this.saveContacts();
    console.log(`[contacts] ✅ Added: ${name} (${did.slice(0, 32)}...)`);
  }

  /**
   * Get public key as base64 string (extracted from DID)
   */
  getPublicKeyBase64(): string {
    if (!this.did) return '';
    const pubkeyBytes = extractPublicKeyFromDID(this.did);
    return Buffer.from(pubkeyBytes).toString('base64');
  }

  /**
   * Connect to relay via WebSocket
   */
  async connect(): Promise<boolean> {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return true;
    }

    this.isConnecting = true;
    const wsUrl = this.relayUrl.replace(/\/$/, '') + '/ws';

    console.log(`[agent] 📡 Connecting to relay...`);
    console.log(`[agent] URL: ${wsUrl}`);

    return new Promise((resolve) => {
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        if (!this.did) {
          console.log('[agent] ❌ No DID available');
          this.isConnecting = false;
          resolve(false);
          return;
        }

        // Send connect message with DID
        const connectMsg: WSMessage = { type: 'connected', to: this.did };
        this.ws!.send(JSON.stringify({ type: 'connect', did: this.did }));

        console.log(`[agent] ✅ Connected to relay`);
        this.reconnectAttempts = 0;
        this.reconnectDelay = 2000;
        this.isConnecting = false;

        // Start listening
        this.listen();

        // Send queued messages
        this.processMessageQueue();

        resolve(true);
      });

      this.ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());

          if (message.error) {
            console.log(`[agent] ⚠️  Relay error: ${message.error}`);
            return;
          }

          if (message.type === 'message' && message.content) {
            await this.handleIncomingMessage(message);
          }
        } catch (error) {
          console.log(`[agent] ❌ Error handling message: ${error}`);
        }
      });

      this.ws.on('close', () => {
        console.log(`[agent] 🔌 Disconnected from relay`);
        this.ws = null;
        this.isConnecting = false;

        // Auto-reconnect
        this.scheduleReconnect();
      });

      this.ws.on('error', (error) => {
        console.log(`[agent] ❌ WebSocket error: ${error}`);
        this.isConnecting = false;
        resolve(false);
      });
    });
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log(`[agent] ❌ Max reconnect attempts reached`);
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 60000); // Cap at 60 seconds

    console.log(`[agent] 🔁 Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Handle incoming message
   */
  private async handleIncomingMessage(message: WSMessage): Promise<void> {
    const senderDID = message.from;
    const encryptedB64 = message.content;

    if (!senderDID || !encryptedB64) {
      console.log(`[agent] ⚠️  Invalid message format`);
      return;
    }

    console.log(`\n[agent] 📬 Message received!`);
    console.log(`[agent] From: ${senderDID.slice(0, 32)}...`);

    try {
      // Get sender's public key from their DID
      const senderPublicKey = extractPublicKeyFromDID(senderDID);

      // Decrypt
      const plaintext = decryptMessage(encryptedB64, senderPublicKey);

      console.log(`[agent] Content: ${plaintext}`);

      // Save to local file
      this.saveMessage(senderDID, plaintext, message.timestamp);

      // Notify callback if set
      if (this.messageCallback) {
        this.messageCallback(senderDID, plaintext, message.timestamp);
      }
    } catch (error) {
      console.log(`[agent] ❌ Decryption failed: ${error}`);
    }
  }

  /**
   * Listen for incoming messages (already handled in connect())
   */
  private listen(): void {
    console.log(`[agent] 👂 Listening for messages...`);
  }

  /**
   * Process queued messages
   */
  private async processMessageQueue(): Promise<void> {
    while (this.messageQueue.length > 0) {
      const msg = this.messageQueue.shift();
      if (msg) {
        await this.sendMessage(msg.to, msg.content);
      }
    }
  }

  /**
   * Send message to recipient
   */
  async sendMessage(recipientDID: DID, content: string): Promise<boolean> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log(`[agent] ❌ Not connected, queuing message`);
      this.messageQueue.push({
        to: recipientDID,
        content,
        timestamp: getCurrentTimestamp(),
      });
      return false;
    }

    if (!(recipientDID in this.contacts)) {
      console.log(`[agent] ❌ Recipient not in contacts: ${recipientDID}`);
      return false;
    }

    if (!recipientDID.startsWith('did:key:ed25519:')) {
      console.log(`[agent] ❌ Unsupported DID format`);
      return false;
    }

    // Get recipient's public key
    const recipientPublicKey = extractPublicKeyFromDID(recipientDID);

    console.log(`[agent] 🔒 Encrypting message for ${this.contacts[recipientDID].name}...`);

    // Encrypt
    const encryptedB64 = encryptMessage(content, recipientPublicKey);

    // Send via relay
    const messageData: WSMessage = {
      type: 'message',
      to: recipientDID,
      content: encryptedB64,
    };

    try {
      this.ws.send(JSON.stringify(messageData));
      console.log(`[agent] ✅ Message sent to ${this.contacts[recipientDID].name}`);
      return true;
    } catch (error) {
      console.log(`[agent] ❌ Send failed: ${error}`);
      return false;
    }
  }

  /**
   * Save message to local file
   */
  private saveMessage(senderDID: DID, content: string, timestamp?: string): void {
    const messagesDir = path.join(this.dataDir, 'messages');
    ensureDir(messagesDir);

    const safeDID = sanitizeDID(senderDID);
    const timestampStr = formatTimestampForFile(timestamp);
    const filename = `${timestampStr}_${safeDID}.json`;
    const filepath = path.join(messagesDir, filename);

    const messageRecord = {
      from: senderDID,
      content,
      timestamp: timestamp || getCurrentTimestamp(),
      savedAt: getCurrentTimestamp(),
    };

    fs.writeFileSync(filepath, JSON.stringify(messageRecord, null, 2));
    console.log(`[agent] 💾 Saved: ${filepath}`);
  }

  /**
   * Get saved messages
   */
  getMessages(limit = 50, fromDID?: string): Array<{ from: DID; content: string; timestamp: string; savedAt: string }> {
    const messagesDir = path.join(this.dataDir, 'messages');

    if (!fs.existsSync(messagesDir)) {
      return [];
    }

    const messageFiles = fs.readdirSync(messagesDir)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, limit);

    const messages: Array<{ from: DID; content: string; timestamp: string; savedAt: string }> = [];

    for (const filename of messageFiles) {
      const filepath = path.join(messagesDir, filename);
      const msg = JSON.parse(fs.readFileSync(filepath, 'utf-8'));

      if (fromDID) {
        // Filter by sender
        const fromLower = fromDID.toLowerCase();
        const msgFrom = msg.from.toLowerCase();
        if (!msgFrom.includes(fromLower)) {
          continue;
        }
      }

      messages.push(msg);
    }

    return messages;
  }

  /**
   * Disconnect from relay
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
