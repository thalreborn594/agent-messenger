// Type definitions for Agent Messenger

/**
 * DID format: did:key:ed25519:BASE64_URLSAFE_NO_PADDING
 */
export type DID = string;

/**
 * Ed25519 key pair
 */
export interface KeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

/**
 * Identity information
 */
export interface Identity {
  did: DID;
  keyType: 'Ed25519';
  createdAt: string;
  version: string;
}

/**
 * Identity storage format
 */
export interface IdentityStorage {
  did: DID;
  public_key_b64: string;
  created_at: string;
}

/**
 * Contact information
 */
export interface Contact {
  name: string;
  did: DID;
  addedAt: string;
  notes: string;
}

/**
 * Stored message
 */
export interface StoredMessage {
  from: DID;
  content: string;
  timestamp: string;
  savedAt: string;
  saved_at?: string;
}

/**
 * Message callback
 */
export type MessageCallback = (
  senderDID: DID,
  content: string,
  timestamp?: string
) => void;

/**
 * Contact book (keyed by DID)
 */
export type ContactBook = Record<DID, Contact>;

/**
 * WebSocket message types
 */
export interface WSMessage {
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
export interface DirectoryRegistration {
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
export interface DirectoryEntry {
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
export interface DirectoryResponse {
  agents: DirectoryEntry[];
  count: number;
}

/**
 * Client configuration
 */
export interface ClientConfig {
  relayUrl: string;
  dataDir?: string;
}

/**
 * Daemon configuration
 */
export interface DaemonConfig {
  relayUrl: string;
  dataDir?: string;
  apiHost?: string;
  apiPort?: number;
  profile?: string;
}

/**
 * Status information
 */
export interface Status {
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
export interface SendMessageRequest {
  to?: DID;
  toName?: string;
  content: string;
}

/**
 * Add contact request
 */
export interface AddContactRequest {
  did: DID;
  name: string;
  notes?: string;
}

/**
 * Register request
 */
export interface RegisterRequest {
  username: string;
  description?: string;
  purpose?: string;
  tags?: string[];
}
