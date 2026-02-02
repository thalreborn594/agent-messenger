/**
 * DID format: did:key:ed25519:BASE64_URLSAFE_NO_PADDING
 */
type DID = string;
/**
 * Ed25519 key pair
 */
interface KeyPair {
    privateKey: Uint8Array;
    publicKey: Uint8Array;
}
/**
 * Identity information
 */
interface Identity {
    did: DID;
    keyType: 'Ed25519';
    createdAt: string;
    version: string;
}
/**
 * Identity storage format
 */
interface IdentityStorage {
    did: DID;
    public_key_b64: string;
    created_at: string;
}
/**
 * Contact information
 */
interface Contact {
    name: string;
    did: DID;
    addedAt: string;
    notes: string;
}
/**
 * Stored message
 */
interface StoredMessage {
    from: DID;
    content: string;
    timestamp: string;
    savedAt: string;
    saved_at?: string;
}
/**
 * Message callback
 */
type MessageCallback = (senderDID: DID, content: string, timestamp?: string) => void;
/**
 * Contact book (keyed by DID)
 */
type ContactBook = Record<DID, Contact>;
/**
 * WebSocket message types
 */
interface WSMessage {
    type: 'message' | 'connected' | 'error';
    from?: DID;
    to?: DID;
    content?: string;
    error?: string;
    timestamp?: string;
}
/**
 * Directory registration info
 */
interface DirectoryRegistration {
    username: string;
    did: DID;
    publicKey: string;
    description?: string;
    purpose?: string;
    tags?: string[];
}
/**
 * Directory entry
 */
interface DirectoryEntry {
    username: string;
    did: DID;
    description?: string;
    purpose?: string;
    tags?: string[];
    registeredAt?: string;
}
/**
 * Directory response
 */
interface DirectoryResponse {
    agents: DirectoryEntry[];
    count: number;
}
/**
 * Client configuration
 */
interface ClientConfig {
    relayUrl: string;
    dataDir?: string;
}
/**
 * Daemon configuration
 */
interface DaemonConfig {
    relayUrl: string;
    dataDir?: string;
    apiHost?: string;
    apiPort?: number;
    profile?: string;
}
/**
 * Status information
 */
interface Status {
    did: DID;
    relay: string;
    connected: boolean;
    contacts: number;
    messages: number;
    dataDir: string;
    profile: string;
}
/**
 * Send message request
 */
interface SendMessageRequest {
    to?: DID;
    toName?: string;
    content: string;
}
/**
 * Add contact request
 */
interface AddContactRequest {
    did: DID;
    name: string;
    notes?: string;
}
/**
 * Register request
 */
interface RegisterRequest {
    username: string;
    description?: string;
    purpose?: string;
    tags?: string[];
}

declare class AgentClient {
    private relayUrl;
    private dataDir;
    private privateKey;
    private publicKey;
    private did;
    private contacts;
    private ws;
    private messageCallback;
    private messageQueue;
    private reconnectAttempts;
    private maxReconnectAttempts;
    private reconnectDelay;
    private isConnecting;
    constructor(relayUrl: string, dataDir?: string);
    /**
     * Initialize agent identity and load contacts
     */
    initialize(): Promise<void>;
    /**
     * Load existing identity or create new one
     */
    private loadOrCreateIdentity;
    /**
     * Load contacts from file
     */
    private loadContacts;
    /**
     * Save contacts to file
     */
    private saveContacts;
    /**
     * Set callback for incoming messages
     */
    setMessageCallback(callback: MessageCallback): void;
    /**
     * Get this agent's DID
     */
    getDID(): DID | null;
    /**
     * Get contacts
     */
    getContacts(): ContactBook;
    /**
     * Find contact by exact name match
     */
    findContactByName(name: string): DID | null;
    /**
     * Find contacts by fuzzy name matching
     */
    findContactsFuzzy(name: string, threshold?: number): Array<{
        did: DID;
        name: string;
        score: number;
    }>;
    /**
     * Calculate similarity ratio between two strings (Levenshtein distance)
     */
    private calculateSimilarity;
    /**
     * Add a contact
     */
    addContact(name: string, did: DID, notes?: string): void;
    /**
     * Get public key as base64 string (extracted from DID)
     */
    getPublicKeyBase64(): string;
    /**
     * Connect to relay via WebSocket
     */
    connect(): Promise<boolean>;
    /**
     * Schedule reconnection attempt
     */
    private scheduleReconnect;
    /**
     * Handle incoming message
     */
    private handleIncomingMessage;
    /**
     * Listen for incoming messages (already handled in connect())
     */
    private listen;
    /**
     * Process queued messages
     */
    private processMessageQueue;
    /**
     * Send message to recipient
     */
    sendMessage(recipientDID: DID, content: string): Promise<boolean>;
    /**
     * Save message to local file
     */
    private saveMessage;
    /**
     * Get saved messages
     */
    getMessages(limit?: number, fromDID?: string): Array<{
        from: DID;
        content: string;
        timestamp: string;
        savedAt: string;
    }>;
    /**
     * Disconnect from relay
     */
    disconnect(): void;
    /**
     * Check if connected
     */
    isConnected(): boolean;
}

declare class AgentDaemon {
    private client;
    private app;
    private port;
    private host;
    private dataDir;
    private profile?;
    private lockFilePath;
    constructor(relayUrl: string, dataDir?: string, apiPort?: number, apiHost?: string, profile?: string);
    /**
     * Setup HTTP API routes
     */
    private setupRoutes;
    /**
     * Acquire lock file to prevent multiple instances
     */
    private acquireLock;
    /**
     * Release lock file
     */
    private releaseLock;
    /**
     * Start the daemon
     */
    start(): Promise<void>;
}

/**
 * Generate Ed25519 key pair
 */
declare function generateKeyPair(): KeyPair;
/**
 * Derive DID from public key
 * Format: did:key:ed25519:BASE64_URLSAFE_NO_PADDING
 */
declare function deriveDID(publicKey: Uint8Array): DID;
/**
 * Sign message with private key
 */
declare function signMessage(privateKey: Uint8Array, message: Uint8Array): Uint8Array;
/**
 * Verify signature with public key
 */
declare function verifySignature(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean;
/**
 * Derive shared key using HKDF
 * Uses recipient's public key as input material
 */
declare function deriveSharedKey(recipientPublicKey: Uint8Array): Uint8Array;
/**
 * Extract public key from DID
 */
declare function extractPublicKeyFromDID(did: DID): Uint8Array;
/**
 * Compress data using zlib
 */
declare function compress(data: Uint8Array): Uint8Array;
/**
 * Decompress data using zlib
 */
declare function decompress(data: Uint8Array): Uint8Array;
/**
 * Encrypt message for recipient
 * Returns: base64-encoded ciphertext
 */
declare function encryptMessage(plaintext: string, recipientPublicKey: Uint8Array): string;
/**
 * Decrypt message from sender
 * Returns: plaintext string
 */
declare function decryptMessage(encryptedB64: string, senderPublicKey: Uint8Array): string;

/**
 * Utility functions for Agent Messenger v3.0
 * - File I/O operations
 * - Data directory management
 * - OS-specific paths
 */

/**
 * Get platform-specific data directory
 */
declare function getDataDir(customDir?: string): string;
/**
 * Ensure directory exists, create if not
 */
declare function ensureDir(dirPath: string): void;
/**
 * Read JSON file safely
 */
declare function readJSON<T>(filePath: string): T | null;
/**
 * Write JSON file safely
 */
declare function writeJSON<T>(filePath: string, data: T): void;
/**
 * Save Ed25519 keypair to disk
 * - identity.key: binary private key (0o600)
 * - identity.json: public identity metadata
 */
declare function saveKeypair(dataDir: string, keypair: KeyPair, did: DID): void;
/**
 * Load Ed25519 keypair from disk
 */
declare function loadKeypair(dataDir: string): {
    keypair: KeyPair;
    did: DID;
} | null;
/**
 * Get or create keypair
 */
declare function getOrCreateKeypair(dataDir: string): {
    keypair: KeyPair;
    did: DID;
};
/**
 * Load contacts from contacts.json
 */
declare function loadContacts(dataDir: string): ContactBook;
/**
 * Save contacts to contacts.json
 */
declare function saveContacts(dataDir: string, contacts: ContactBook): void;
/**
 * Sanitize DID for use in filename
 * Keeps only alphanumeric characters and underscores
 */
declare function sanitizeDID(did: DID): string;
/**
 * Save message to disk
 * Format: messages/{timestamp}_{sanitized_did}.json
 */
declare function saveMessage(dataDir: string, from: DID, content: string, timestamp?: string): void;
/**
 * List all messages from disk
 */
declare function listMessages(dataDir: string, options?: {
    limit?: number;
    from?: DID;
}): StoredMessage[];
/**
 * Find contact by name or DID
 */
declare function findContact(dataDir: string, nameOrDID: string): {
    did: DID;
    contact: any;
} | null;
/**
 * Get lock file path
 */
declare function getLockFilePath(dataDir: string): string;
/**
 * Check if daemon is running (lock file exists)
 */
declare function isDaemonRunning(dataDir: string): boolean;
/**
 * Create lock file
 */
declare function createLockFile(dataDir: string, pid: number): void;
/**
 * Remove lock file
 */
declare function removeLockFile(dataDir: string): void;
/**
 * Get current timestamp in ISO 8601 format
 */
declare function getTimestamp(): string;
/**
 * Validate DID format
 */
declare function isValidDID(did: string): boolean;
/**
 * Parse username from @username format
 */
declare function parseUsername(username: string): string;
/**
 * Format username with @ prefix
 */
declare function formatUsername(username: string): string;
/**
 * Base64 URL-safe encoding (no padding)
 */
declare function base64UrlEncode(data: Uint8Array): string;
/**
 * Base64 URL-safe decoding
 */
declare function base64UrlDecode(str: string): Uint8Array;
/**
 * Format timestamp for filename
 */
declare function formatTimestampForFile(timestamp?: string): string;
/**
 * Get current ISO timestamp
 */
declare function getCurrentTimestamp(): string;
/**
 * Sleep utility
 */
declare function sleep(ms: number): Promise<void>;
/**
 * Validate username format
 */
declare function validateUsername(username: string): boolean;

export { type AddContactRequest, AgentClient, AgentDaemon, type ClientConfig, type Contact, type ContactBook, type DID, type DaemonConfig, type DirectoryEntry, type DirectoryRegistration, type DirectoryResponse, type Identity, type IdentityStorage, type KeyPair, type MessageCallback, type RegisterRequest, type SendMessageRequest, type Status, type StoredMessage, type WSMessage, base64UrlDecode, base64UrlEncode, compress, createLockFile, decompress, decryptMessage, deriveDID, deriveSharedKey, encryptMessage, ensureDir, extractPublicKeyFromDID, findContact, formatTimestampForFile, formatUsername, generateKeyPair, getCurrentTimestamp, getDataDir, getLockFilePath, getOrCreateKeypair, getTimestamp, isDaemonRunning, isValidDID, listMessages, loadContacts, loadKeypair, parseUsername, readJSON, removeLockFile, sanitizeDID, saveContacts, saveKeypair, saveMessage, signMessage, sleep, validateUsername, verifySignature, writeJSON };
