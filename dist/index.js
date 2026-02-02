var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/client.ts
import WebSocket from "ws";

// src/crypto.ts
import { ed25519 } from "@noble/curves/ed25519";
import { chacha20poly1305 } from "@noble/ciphers/chacha";
import { hkdfSync } from "crypto";

// src/utils.ts
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
function getDataDir(customDir) {
  if (customDir) {
    return customDir;
  }
  const platform2 = os.platform();
  const homeDir = os.homedir();
  switch (platform2) {
    case "win32":
      return path.join(process.env.APPDATA || path.join(homeDir, "AppData", "Roaming"), "agent-messenger");
    case "darwin":
      return path.join(homeDir, ".agent-messenger");
    default:
      return path.join(homeDir, ".agent-messenger");
  }
}
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true, mode: 448 });
  }
}
function readJSON(filePath) {
  try {
    const data = fs.readFileSync(filePath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}
function writeJSON(filePath, data) {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), {
    encoding: "utf8",
    mode: 384
  });
}
function saveKeypair(dataDir, keypair, did) {
  const keyPath = path.join(dataDir, "identity.key");
  const jsonPath = path.join(dataDir, "identity.json");
  ensureDir(dataDir);
  fs.writeFileSync(keyPath, Buffer.from(keypair.privateKey), {
    mode: 384
  });
  const identity = {
    did,
    public_key_b64: Buffer.from(keypair.publicKey).toString("base64"),
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  writeJSON(jsonPath, identity);
}
function loadKeypair(dataDir) {
  try {
    const keyPath = path.join(dataDir, "identity.key");
    const jsonPath = path.join(dataDir, "identity.json");
    const privateKey = fs.readFileSync(keyPath);
    const identity = readJSON(jsonPath);
    if (!identity) {
      return null;
    }
    const { ed25519: ed255192 } = __require("@noble/curves/ed25519");
    const publicKey = ed255192.getPublicKey(privateKey);
    const keypair = {
      publicKey,
      privateKey: new Uint8Array(privateKey)
    };
    return {
      keypair,
      did: identity.did
    };
  } catch (error) {
    return null;
  }
}
function getOrCreateKeypair(dataDir) {
  const existing = loadKeypair(dataDir);
  if (existing) {
    return existing;
  }
  const keypair = generateKeyPair();
  const did = deriveDID(keypair.publicKey);
  saveKeypair(dataDir, keypair, did);
  return { keypair, did };
}
function loadContacts(dataDir) {
  const contactsPath = path.join(dataDir, "contacts.json");
  const contacts = readJSON(contactsPath);
  return contacts || {};
}
function saveContacts(dataDir, contacts) {
  const contactsPath = path.join(dataDir, "contacts.json");
  writeJSON(contactsPath, contacts);
}
function sanitizeDID(did) {
  return did.replace(/[^a-zA-Z0-9_]/g, "_");
}
function saveMessage(dataDir, from, content, timestamp) {
  const messagesDir = path.join(dataDir, "messages");
  ensureDir(messagesDir);
  const msgTimestamp = timestamp || (/* @__PURE__ */ new Date()).toISOString();
  const sanitized = sanitizeDID(from);
  const filename = `${msgTimestamp.replace(/[^0-9]/g, "")}_${sanitized}.json`;
  const filePath = path.join(messagesDir, filename);
  const message = {
    from,
    content,
    timestamp: msgTimestamp,
    savedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  writeJSON(filePath, message);
}
function listMessages(dataDir, options = {}) {
  const messagesDir = path.join(dataDir, "messages");
  if (!fs.existsSync(messagesDir)) {
    return [];
  }
  const files = fs.readdirSync(messagesDir).filter((f) => f.endsWith(".json")).sort().reverse();
  const messages = [];
  for (const file of files) {
    if (options.limit && messages.length >= options.limit) {
      break;
    }
    const filePath = path.join(messagesDir, file);
    const message = readJSON(filePath);
    if (message) {
      if (options.from && message.from !== options.from) {
        continue;
      }
      messages.push(message);
    }
  }
  return messages;
}
function findContact(dataDir, nameOrDID) {
  const contacts = loadContacts(dataDir);
  if (contacts[nameOrDID]) {
    return {
      did: nameOrDID,
      contact: contacts[nameOrDID]
    };
  }
  for (const [did, contact] of Object.entries(contacts)) {
    if (contact.name.toLowerCase() === nameOrDID.toLowerCase()) {
      return { did, contact };
    }
  }
  return null;
}
function getLockFilePath(dataDir) {
  return path.join(dataDir, "daemon.lock");
}
function isDaemonRunning(dataDir) {
  const lockPath = getLockFilePath(dataDir);
  return fs.existsSync(lockPath);
}
function createLockFile(dataDir, pid) {
  const lockPath = getLockFilePath(dataDir);
  fs.writeFileSync(lockPath, pid.toString(), { mode: 384 });
}
function removeLockFile(dataDir) {
  const lockPath = getLockFilePath(dataDir);
  if (fs.existsSync(lockPath)) {
    fs.unlinkSync(lockPath);
  }
}
function getTimestamp() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function isValidDID(did) {
  return did.startsWith("did:key:ed25519:");
}
function parseUsername(username) {
  if (username.startsWith("@")) {
    return username.slice(1);
  }
  return username;
}
function formatUsername(username) {
  if (username.startsWith("@")) {
    return username;
  }
  return `@${username}`;
}
function base64UrlEncode(data) {
  const base64 = Buffer.from(data).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  return new Uint8Array(Buffer.from(base64, "base64"));
}
function formatTimestampForFile(timestamp) {
  if (timestamp) {
    return timestamp.replace(/[:.]/g, "-");
  }
  const now = /* @__PURE__ */ new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  const second = String(now.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}_${hour}${minute}${second}`;
}
function getCurrentTimestamp() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function validateUsername(username) {
  return /^@[a-zA-Z0-9_]{2,19}$/.test(username);
}

// src/crypto.ts
import * as zlib from "zlib";
var HKDF_INFO = Buffer.from("agent-messenger-v2");
var NONCE = Buffer.from("agent-messenger-v2").slice(0, 12);
function generateKeyPair() {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return {
    privateKey: new Uint8Array(privateKey),
    publicKey: new Uint8Array(publicKey)
  };
}
function deriveDID(publicKey) {
  const pubkeyB64 = base64UrlEncode(publicKey);
  return `did:key:ed25519:${pubkeyB64}`;
}
function signMessage(privateKey, message) {
  const signature = ed25519.sign(message, privateKey);
  return new Uint8Array(signature);
}
function verifySignature(publicKey, message, signature) {
  try {
    return ed25519.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}
function deriveSharedKey(recipientPublicKey) {
  const sharedKey = hkdfSync("sha256", Buffer.from(recipientPublicKey), Buffer.alloc(0), Buffer.from(HKDF_INFO), 32);
  return new Uint8Array(sharedKey);
}
function extractPublicKeyFromDID(did) {
  if (!did.startsWith("did:key:ed25519:")) {
    throw new Error("Invalid DID format");
  }
  const b64Part = did.split("did:key:ed25519:")[1];
  return base64UrlDecode(b64Part);
}
function compress(data) {
  return new Uint8Array(zlib.deflateSync(data));
}
function decompress(data) {
  return new Uint8Array(zlib.inflateSync(data));
}
function encryptMessage(plaintext, recipientPublicKey) {
  const sharedKey = deriveSharedKey(recipientPublicKey);
  const plaintextBytes = Buffer.from(plaintext, "utf-8");
  const compressed = compress(plaintextBytes);
  const cipher = chacha20poly1305(sharedKey, NONCE);
  const ciphertext = cipher.encrypt(compressed);
  const encryptedB64 = Buffer.from(ciphertext).toString("base64");
  return encryptedB64;
}
function decryptMessage(encryptedB64, senderPublicKey) {
  const ciphertext = Buffer.from(encryptedB64, "base64");
  const sharedKey = deriveSharedKey(senderPublicKey);
  const cipher = chacha20poly1305(sharedKey, NONCE);
  const compressed = cipher.decrypt(ciphertext);
  const plaintextBytes = decompress(compressed);
  const plaintext = Buffer.from(plaintextBytes).toString("utf-8");
  return plaintext;
}

// src/client.ts
import * as fs2 from "fs";
import * as path2 from "path";
var CONTACTS_FILE = "contacts.json";
var IDENTITY_FILE = "identity.json";
var KEY_FILE = "identity.key";
var AgentClient = class {
  constructor(relayUrl, dataDir) {
    this.privateKey = null;
    this.publicKey = null;
    this.did = null;
    this.contacts = {};
    this.ws = null;
    this.messageCallback = null;
    this.messageQueue = [];
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 2e3;
    // Start at 2 seconds
    this.isConnecting = false;
    this.relayUrl = relayUrl;
    this.dataDir = dataDir || getDataDir();
  }
  /**
   * Initialize agent identity and load contacts
   */
  async initialize() {
    ensureDir(this.dataDir);
    await this.loadOrCreateIdentity();
    this.loadContacts();
    console.log(`[agent] \u2705 Initialized`);
    console.log(`[agent] DID: ${this.did}`);
    console.log(`[agent] Contacts loaded: ${Object.keys(this.contacts).length}`);
  }
  /**
   * Load existing identity or create new one
   */
  async loadOrCreateIdentity() {
    const identityPath = path2.join(this.dataDir, IDENTITY_FILE);
    const keyPath = path2.join(this.dataDir, KEY_FILE);
    if (fs2.existsSync(identityPath) && fs2.existsSync(keyPath)) {
      const identityInfo = JSON.parse(fs2.readFileSync(identityPath, "utf-8"));
      const privateKeyBytes = fs2.readFileSync(keyPath);
      this.privateKey = new Uint8Array(privateKeyBytes);
      const { ed25519: ed255192 } = await import("@noble/curves/ed25519");
      this.publicKey = new Uint8Array(ed255192.getPublicKey(this.privateKey));
      this.did = identityInfo.did;
      console.log(`[identity] \u2705 Loaded existing identity`);
      console.log(`[identity] DID: ${this.did}`);
    } else {
      console.log(`[identity] \u{1F511} Generating new identity...`);
      const keypair = generateKeyPair();
      this.privateKey = keypair.privateKey;
      this.publicKey = keypair.publicKey;
      this.did = deriveDID(this.publicKey);
      fs2.writeFileSync(keyPath, Buffer.from(this.privateKey));
      fs2.chmodSync(keyPath, 384);
      const identityInfo = {
        did: this.did,
        keyType: "Ed25519",
        createdAt: getCurrentTimestamp(),
        version: "3.0"
      };
      fs2.writeFileSync(identityPath, JSON.stringify(identityInfo, null, 2));
      console.log(`[identity] \u2705 New identity created`);
      console.log(`[identity] DID: ${this.did}`);
    }
  }
  /**
   * Load contacts from file
   */
  loadContacts() {
    const contactsPath = path2.join(this.dataDir, CONTACTS_FILE);
    if (fs2.existsSync(contactsPath)) {
      this.contacts = JSON.parse(fs2.readFileSync(contactsPath, "utf-8"));
    } else {
      this.contacts = {};
      this.saveContacts();
    }
  }
  /**
   * Save contacts to file
   */
  saveContacts() {
    const contactsPath = path2.join(this.dataDir, CONTACTS_FILE);
    ensureDir(this.dataDir);
    fs2.writeFileSync(contactsPath, JSON.stringify(this.contacts, null, 2));
  }
  /**
   * Set callback for incoming messages
   */
  setMessageCallback(callback) {
    this.messageCallback = callback;
  }
  /**
   * Get this agent's DID
   */
  getDID() {
    return this.did;
  }
  /**
   * Get contacts
   */
  getContacts() {
    return { ...this.contacts };
  }
  /**
   * Find contact by exact name match
   */
  findContactByName(name) {
    const nameLower = name.toLowerCase();
    for (const [did, info] of Object.entries(this.contacts)) {
      if (info.name.toLowerCase() === nameLower) {
        return did;
      }
    }
    return null;
  }
  /**
   * Find contacts by fuzzy name matching
   */
  findContactsFuzzy(name, threshold = 0.3) {
    const nameLower = name.toLowerCase();
    const matches = [];
    for (const [did, info] of Object.entries(this.contacts)) {
      const contactName = info.name.toLowerCase();
      const ratio = this.calculateSimilarity(nameLower, contactName);
      if (ratio >= threshold) {
        matches.push({
          did,
          name: info.name,
          score: ratio
        });
      }
    }
    matches.sort((a, b) => b.score - a.score);
    return matches;
  }
  /**
   * Calculate similarity ratio between two strings (Levenshtein distance)
   */
  calculateSimilarity(str1, str2) {
    if (str1 === str2) return 1;
    if (str1.length === 0 || str2.length === 0) return 0;
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
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
  addContact(name, did, notes = "") {
    this.contacts[did] = {
      name,
      did,
      addedAt: getCurrentTimestamp(),
      notes
    };
    this.saveContacts();
    console.log(`[contacts] \u2705 Added: ${name} (${did.slice(0, 32)}...)`);
  }
  /**
   * Get public key as base64 string (extracted from DID)
   */
  getPublicKeyBase64() {
    if (!this.did) return "";
    const pubkeyBytes = extractPublicKeyFromDID(this.did);
    return Buffer.from(pubkeyBytes).toString("base64");
  }
  /**
   * Connect to relay via WebSocket
   */
  async connect() {
    if (this.isConnecting || this.ws && this.ws.readyState === WebSocket.OPEN) {
      return true;
    }
    this.isConnecting = true;
    const wsUrl = this.relayUrl.replace(/\/$/, "") + "/ws";
    console.log(`[agent] \u{1F4E1} Connecting to relay...`);
    console.log(`[agent] URL: ${wsUrl}`);
    return new Promise((resolve) => {
      this.ws = new WebSocket(wsUrl);
      this.ws.on("open", () => {
        if (!this.did) {
          console.log("[agent] \u274C No DID available");
          this.isConnecting = false;
          resolve(false);
          return;
        }
        const connectMsg = { type: "connected", to: this.did };
        this.ws.send(JSON.stringify({ type: "connect", did: this.did }));
        console.log(`[agent] \u2705 Connected to relay`);
        this.reconnectAttempts = 0;
        this.reconnectDelay = 2e3;
        this.isConnecting = false;
        this.listen();
        this.processMessageQueue();
        resolve(true);
      });
      this.ws.on("message", async (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.error) {
            console.log(`[agent] \u26A0\uFE0F  Relay error: ${message.error}`);
            return;
          }
          if (message.type === "message" && message.content) {
            await this.handleIncomingMessage(message);
          }
        } catch (error) {
          console.log(`[agent] \u274C Error handling message: ${error}`);
        }
      });
      this.ws.on("close", () => {
        console.log(`[agent] \u{1F50C} Disconnected from relay`);
        this.ws = null;
        this.isConnecting = false;
        this.scheduleReconnect();
      });
      this.ws.on("error", (error) => {
        console.log(`[agent] \u274C WebSocket error: ${error}`);
        this.isConnecting = false;
        resolve(false);
      });
    });
  }
  /**
   * Schedule reconnection attempt
   */
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log(`[agent] \u274C Max reconnect attempts reached`);
      return;
    }
    this.reconnectAttempts++;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 6e4);
    console.log(`[agent] \u{1F501} Reconnecting in ${delay / 1e3}s (attempt ${this.reconnectAttempts})`);
    setTimeout(() => {
      this.connect();
    }, delay);
  }
  /**
   * Handle incoming message
   */
  async handleIncomingMessage(message) {
    const senderDID = message.from;
    const encryptedB64 = message.content;
    if (!senderDID || !encryptedB64) {
      console.log(`[agent] \u26A0\uFE0F  Invalid message format`);
      return;
    }
    console.log(`
[agent] \u{1F4EC} Message received!`);
    console.log(`[agent] From: ${senderDID.slice(0, 32)}...`);
    try {
      const senderPublicKey = extractPublicKeyFromDID(senderDID);
      const plaintext = decryptMessage(encryptedB64, senderPublicKey);
      console.log(`[agent] Content: ${plaintext}`);
      this.saveMessage(senderDID, plaintext, message.timestamp);
      if (this.messageCallback) {
        this.messageCallback(senderDID, plaintext, message.timestamp);
      }
    } catch (error) {
      console.log(`[agent] \u274C Decryption failed: ${error}`);
    }
  }
  /**
   * Listen for incoming messages (already handled in connect())
   */
  listen() {
    console.log(`[agent] \u{1F442} Listening for messages...`);
  }
  /**
   * Process queued messages
   */
  async processMessageQueue() {
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
  async sendMessage(recipientDID, content) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log(`[agent] \u274C Not connected, queuing message`);
      this.messageQueue.push({
        to: recipientDID,
        content,
        timestamp: getCurrentTimestamp()
      });
      return false;
    }
    if (!(recipientDID in this.contacts)) {
      console.log(`[agent] \u274C Recipient not in contacts: ${recipientDID}`);
      return false;
    }
    if (!recipientDID.startsWith("did:key:ed25519:")) {
      console.log(`[agent] \u274C Unsupported DID format`);
      return false;
    }
    const recipientPublicKey = extractPublicKeyFromDID(recipientDID);
    console.log(`[agent] \u{1F512} Encrypting message for ${this.contacts[recipientDID].name}...`);
    const encryptedB64 = encryptMessage(content, recipientPublicKey);
    const messageData = {
      type: "message",
      to: recipientDID,
      content: encryptedB64
    };
    try {
      this.ws.send(JSON.stringify(messageData));
      console.log(`[agent] \u2705 Message sent to ${this.contacts[recipientDID].name}`);
      return true;
    } catch (error) {
      console.log(`[agent] \u274C Send failed: ${error}`);
      return false;
    }
  }
  /**
   * Save message to local file
   */
  saveMessage(senderDID, content, timestamp) {
    const messagesDir = path2.join(this.dataDir, "messages");
    ensureDir(messagesDir);
    const safeDID = sanitizeDID(senderDID);
    const timestampStr = formatTimestampForFile(timestamp);
    const filename = `${timestampStr}_${safeDID}.json`;
    const filepath = path2.join(messagesDir, filename);
    const messageRecord = {
      from: senderDID,
      content,
      timestamp: timestamp || getCurrentTimestamp(),
      savedAt: getCurrentTimestamp()
    };
    fs2.writeFileSync(filepath, JSON.stringify(messageRecord, null, 2));
    console.log(`[agent] \u{1F4BE} Saved: ${filepath}`);
  }
  /**
   * Get saved messages
   */
  getMessages(limit = 50, fromDID) {
    const messagesDir = path2.join(this.dataDir, "messages");
    if (!fs2.existsSync(messagesDir)) {
      return [];
    }
    const messageFiles = fs2.readdirSync(messagesDir).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, limit);
    const messages = [];
    for (const filename of messageFiles) {
      const filepath = path2.join(messagesDir, filename);
      const msg = JSON.parse(fs2.readFileSync(filepath, "utf-8"));
      if (fromDID) {
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
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
  /**
   * Check if connected
   */
  isConnected() {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
};

// src/daemon.ts
import express from "express";
import axios from "axios";
import { existsSync as existsSync3, mkdirSync as mkdirSync2, readFileSync as readFileSync3, unlinkSync as unlinkSync2 } from "fs";
import { join as join3 } from "path";
var DEFAULT_API_PORT = 5757;
var LOCK_FILE = "daemon.lock";
var AgentDaemon = class {
  constructor(relayUrl, dataDir, apiPort = DEFAULT_API_PORT, apiHost = "127.0.0.1", profile) {
    if (dataDir) {
      this.dataDir = dataDir;
    } else if (profile) {
      this.dataDir = join3(getDataDir(), "profiles", profile);
    } else {
      this.dataDir = getDataDir();
    }
    this.port = apiPort;
    this.host = apiHost;
    this.profile = profile;
    this.lockFilePath = join3(this.dataDir, LOCK_FILE);
    this.client = new AgentClient(relayUrl, this.dataDir);
    this.app = express();
    this.app.use(express.json());
    this.setupRoutes();
  }
  /**
   * Setup HTTP API routes
   */
  setupRoutes() {
    this.app.get("/", (req, res) => {
      res.json({
        service: "Agent Messenger Daemon",
        version: "3.0",
        status: "running",
        did: this.client.getDID(),
        connected: this.client.isConnected(),
        dataDir: this.dataDir
      });
    });
    this.app.get("/status", (req, res) => {
      const contacts = this.client.getContacts();
      const messages = this.client.getMessages();
      const status = {
        did: this.client.getDID() || "",
        relay: this.client["relayUrl"] || "",
        connected: this.client.isConnected(),
        contacts: Object.keys(contacts).length,
        messages: messages.length,
        dataDir: this.dataDir,
        profile: this.profile || "default"
      };
      res.json(status);
    });
    this.app.post("/send", async (req, res) => {
      try {
        const { to, toName, content } = req.body;
        if (!content) {
          return res.status(400).json({ detail: "Content is required" });
        }
        if (!to && !toName) {
          return res.status(400).json({ detail: "Must specify to or to_name" });
        }
        let recipientDID = null;
        if (to) {
          recipientDID = to;
        } else if (toName) {
          recipientDID = this.client.findContactByName(toName);
          if (!recipientDID) {
            const matches = this.client.findContactsFuzzy(toName);
            if (matches.length > 0) {
              return res.status(300).json({
                status: "ambiguous_name",
                message: `No exact match for '${toName}'. Did you mean:`,
                suggestions: matches.slice(0, 3).map(
                  (m) => `${m.name} (DID: ${m.did}, similarity: ${Math.round(m.score * 100)}%)`
                )
              });
            } else {
              return res.status(404).json({ detail: `Contact not found: ${toName}` });
            }
          }
        }
        if (!recipientDID) {
          return res.status(400).json({ detail: "Could not resolve recipient" });
        }
        const success = await this.client.sendMessage(recipientDID, content);
        if (success) {
          res.json({ status: "sent", to: recipientDID, toName });
        } else {
          res.status(500).json({ detail: "Failed to send message" });
        }
      } catch (error) {
        res.status(500).json({ detail: `Error: ${error}` });
      }
    });
    this.app.post("/add-contact", (req, res) => {
      try {
        const { did, name, notes = "" } = req.body;
        if (!did || !name) {
          return res.status(400).json({ detail: "DID and name are required" });
        }
        this.client.addContact(name, did, notes);
        res.json({ status: "added", did, name });
      } catch (error) {
        res.status(500).json({ detail: `Error: ${error}` });
      }
    });
    this.app.get("/contacts", (req, res) => {
      try {
        const contacts = this.client.getContacts();
        const contactsList = Object.values(contacts);
        res.json({ contacts: contactsList });
      } catch (error) {
        res.status(500).json({ detail: `Error: ${error}` });
      }
    });
    this.app.get("/messages", (req, res) => {
      try {
        const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 50;
        const from = req.query.from;
        const messages = this.client.getMessages(limit, from);
        res.json({ messages, count: messages.length });
      } catch (error) {
        res.status(500).json({ detail: `Error: ${error}` });
      }
    });
    this.app.post("/disconnect", (req, res) => {
      this.client.disconnect();
      res.json({ status: "disconnected" });
    });
    this.app.post("/reconnect", async (req, res) => {
      try {
        const success = await this.client.connect();
        if (success) {
          res.json({ status: "connected" });
        } else {
          res.status(500).json({ detail: "Failed to connect" });
        }
      } catch (error) {
        res.status(500).json({ detail: `Error: ${error}` });
      }
    });
    this.app.post("/register", async (req, res) => {
      var _a;
      try {
        const { username, description = "", purpose = "", tags = [] } = req.body;
        if (!username) {
          return res.status(400).json({ detail: "Username is required" });
        }
        if (!validateUsername(username)) {
          return res.status(400).json({
            detail: "Invalid username format. Must start with @, 3-20 chars, alphanumeric + underscore only"
          });
        }
        const did = this.client.getDID();
        if (!did) {
          return res.status(503).json({ detail: "DID not available" });
        }
        const data = {
          username,
          did,
          publicKey: this.client.getPublicKeyBase64(),
          description,
          purpose,
          tags
        };
        const relayHttpUrl = this.client["relayUrl"].replace("ws://", "http://").replace("wss://", "https://").replace("/ws", "");
        const response = await axios.post(`${relayHttpUrl}/directory/register`, data);
        if (response.status === 200) {
          res.json({
            status: "registered",
            message: `Registered username '${username}' in directory`,
            username,
            did: response.data.did
          });
        } else if (response.status === 409) {
          res.status(409).json({ detail: response.data.detail || "Username already taken" });
        } else {
          res.status(500).json({ detail: `Registration failed: ${response.data.detail || "Unknown error"}` });
        }
      } catch (error) {
        if (axios.isAxiosError(error)) {
          if (((_a = error.response) == null ? void 0 : _a.status) === 409) {
            return res.status(409).json({ detail: error.response.data.detail || "Username already taken" });
          }
          return res.status(500).json({ detail: `Registration error: ${error.message}` });
        }
        res.status(500).json({ detail: `Error: ${error}` });
      }
    });
    this.app.get("/directory", async (req, res) => {
      try {
        const search = req.query.search;
        const relayHttpUrl = this.client["relayUrl"].replace("ws://", "http://").replace("wss://", "https://").replace("/ws", "");
        const params = {};
        if (search) {
          params.search = search;
        }
        const response = await axios.get(`${relayHttpUrl}/directory`, { params });
        if (response.status === 200) {
          res.json(response.data);
        } else {
          res.status(500).json({ detail: `Query failed: ${response.statusText}` });
        }
      } catch (error) {
        if (axios.isAxiosError(error)) {
          res.status(500).json({ detail: `Query error: ${error.message}` });
        } else {
          res.status(500).json({ detail: `Error: ${error}` });
        }
      }
    });
  }
  /**
   * Acquire lock file to prevent multiple instances
   */
  acquireLock() {
    mkdirSync2(this.dataDir, { recursive: true });
    try {
      writeFileSync3(this.lockFilePath, process.pid.toString(), { flag: "wx" });
      console.log(`[daemon] \u{1F512} Lock acquired for profile: ${this.dataDir}`);
      return true;
    } catch (error) {
      try {
        const pid = parseInt(readFileSync3(this.lockFilePath, "utf-8").trim(), 10);
        process.kill(pid, 0);
        console.log(`[daemon] \u274C Another instance is already running (PID: ${pid})`);
        return false;
      } catch {
        unlinkSync2(this.lockFilePath);
        return this.acquireLock();
      }
    }
  }
  /**
   * Release lock file
   */
  releaseLock() {
    if (existsSync3(this.lockFilePath)) {
      unlinkSync2(this.lockFilePath);
    }
  }
  /**
   * Start the daemon
   */
  async start() {
    if (!this.acquireLock()) {
      process.exit(1);
    }
    await this.client.initialize();
    const connected = await this.client.connect();
    if (!connected) {
      console.log("[daemon] \u274C Failed to connect to relay");
      this.releaseLock();
      process.exit(1);
    }
    this.app.listen(this.port, this.host, () => {
      console.log(`[daemon] \u2705 Daemon started`);
      console.log(`[daemon] Relay: ${this.client["relayUrl"]}`);
      console.log(`[daemon] API: http://${this.host}:${this.port}`);
      console.log(`[daemon] DID: ${this.client.getDID()}`);
    });
    process.on("SIGINT", () => {
      console.log("[daemon] \u23F9\uFE0F  Shutting down...");
      this.client.disconnect();
      this.releaseLock();
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      console.log("[daemon] \u23F9\uFE0F  Shutting down...");
      this.client.disconnect();
      this.releaseLock();
      process.exit(0);
    });
  }
};
function writeFileSync3(path3, data, options) {
  const fs3 = __require("fs");
  fs3.writeFileSync(path3, data, options);
}
export {
  AgentClient,
  AgentDaemon,
  base64UrlDecode,
  base64UrlEncode,
  compress,
  createLockFile,
  decompress,
  decryptMessage,
  deriveDID,
  deriveSharedKey,
  encryptMessage,
  ensureDir,
  extractPublicKeyFromDID,
  findContact,
  formatTimestampForFile,
  formatUsername,
  generateKeyPair,
  getCurrentTimestamp,
  getDataDir,
  getLockFilePath,
  getOrCreateKeypair,
  getTimestamp,
  isDaemonRunning,
  isValidDID,
  listMessages,
  loadContacts,
  loadKeypair,
  parseUsername,
  readJSON,
  removeLockFile,
  sanitizeDID,
  saveContacts,
  saveKeypair,
  saveMessage,
  signMessage,
  sleep,
  validateUsername,
  verifySignature,
  writeJSON
};
//# sourceMappingURL=index.js.map