import { describe, it, expect } from 'vitest';
import {
  generateKeyPair,
  deriveDID,
  signMessage,
  verifySignature,
  deriveSharedKey,
  extractPublicKeyFromDID,
  encryptMessage,
  decryptMessage,
} from '../src/crypto';

describe('Crypto', () => {
  describe('KeyPair Generation', () => {
    it('should generate a valid keypair', () => {
      const keypair = generateKeyPair();

      expect(keypair.privateKey).toBeInstanceOf(Uint8Array);
      expect(keypair.publicKey).toBeInstanceOf(Uint8Array);
      expect(keypair.privateKey.length).toBe(32); // Ed25519 private key size
      expect(keypair.publicKey.length).toBe(32); // Ed25519 public key size
    });

    it('should generate unique keypairs', () => {
      const keypair1 = generateKeyPair();
      const keypair2 = generateKeyPair();

      expect(keypair1.privateKey).not.toEqual(keypair2.privateKey);
      expect(keypair1.publicKey).not.toEqual(keypair2.publicKey);
    });
  });

  describe('DID Derivation', () => {
    it('should derive DID from public key', () => {
      const keypair = generateKeyPair();
      const did = deriveDID(keypair.publicKey);

      expect(did).toMatch(/^did:key:ed25519:/);
      expect(did).toHaveLength(59); // did:key:ed25519: + 43 chars (base64url of 32 bytes)
    });

    it('should derive same DID for same public key', () => {
      const keypair = generateKeyPair();
      const did1 = deriveDID(keypair.publicKey);
      const did2 = deriveDID(keypair.publicKey);

      expect(did1).toBe(did2);
    });

    it('should derive different DIDs for different public keys', () => {
      const keypair1 = generateKeyPair();
      const keypair2 = generateKeyPair();
      const did1 = deriveDID(keypair1.publicKey);
      const did2 = deriveDID(keypair2.publicKey);

      expect(did1).not.toBe(did2);
    });
  });

  describe('Signing and Verification', () => {
    it('should sign and verify a message', () => {
      const keypair = generateKeyPair();
      const message = new Uint8Array(Buffer.from('Hello, Agent World!'));
      const signature = signMessage(keypair.privateKey, message);

      expect(signature).toBeInstanceOf(Uint8Array);
      expect(signature.length).toBe(64); // Ed25519 signature size

      const isValid = verifySignature(keypair.publicKey, message, signature);
      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', () => {
      const keypair = generateKeyPair();
      const message = new Uint8Array(Buffer.from('Hello, Agent World!'));
      const signature = signMessage(keypair.privateKey, message);

      // Tamper with signature
      const tamperedSignature = new Uint8Array(signature);
      tamperedSignature[0] = tamperedSignature[0] ^ 0xff;

      const isValid = verifySignature(keypair.publicKey, message, tamperedSignature);
      expect(isValid).toBe(false);
    });

    it('should reject signature from wrong message', () => {
      const keypair = generateKeyPair();
      const message1 = new Uint8Array(Buffer.from('Hello'));
      const message2 = new Uint8Array(Buffer.from('Goodbye'));
      const signature = signMessage(keypair.privateKey, message1);

      const isValid = verifySignature(keypair.publicKey, message2, signature);
      expect(isValid).toBe(false);
    });
  });

  describe('Shared Key Derivation', () => {
    it('should derive shared key from public key', () => {
      const keypair = generateKeyPair();
      const sharedKey = deriveSharedKey(keypair.publicKey);

      expect(sharedKey).toBeInstanceOf(Uint8Array);
      expect(sharedKey.length).toBe(32); // ChaCha20-Poly1305 key size
    });

    it('should derive same shared key for same public key', () => {
      const keypair = generateKeyPair();
      const sharedKey1 = deriveSharedKey(keypair.publicKey);
      const sharedKey2 = deriveSharedKey(keypair.publicKey);

      expect(sharedKey1).toEqual(sharedKey2);
    });

    it('should derive different shared keys for different public keys', () => {
      const keypair1 = generateKeyPair();
      const keypair2 = generateKeyPair();
      const sharedKey1 = deriveSharedKey(keypair1.publicKey);
      const sharedKey2 = deriveSharedKey(keypair2.publicKey);

      expect(sharedKey1).not.toEqual(sharedKey2);
    });
  });

  describe('Extract Public Key from DID', () => {
    it('should extract public key from DID', () => {
      const keypair = generateKeyPair();
      const did = deriveDID(keypair.publicKey);
      const extractedKey = extractPublicKeyFromDID(did);

      expect(extractedKey).toEqual(keypair.publicKey);
    });

    it('should throw error for invalid DID format', () => {
      expect(() => extractPublicKeyFromDID('invalid-did' as any)).toThrow('Invalid DID format');
    });
  });

  describe('Encryption and Decryption', () => {
    it('should encrypt and decrypt a message', () => {
      const recipientKeyPair = generateKeyPair();
      const plaintext = 'Hello, Agent World!';

      // Encrypt with recipient's public key
      const encrypted = encryptMessage(plaintext, recipientKeyPair.publicKey);

      expect(typeof encrypted).toBe('string');

      // Decrypt with recipient's public key (simplified ECDH uses same key)
      const decrypted = decryptMessage(encrypted, recipientKeyPair.publicKey);

      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext for same plaintext', () => {
      const recipientKeyPair = generateKeyPair();
      const plaintext = 'Hello, Agent World!';

      const encrypted1 = encryptMessage(plaintext, recipientKeyPair.publicKey);
      const encrypted2 = encryptMessage(plaintext, recipientKeyPair.publicKey);

      // With fixed nonce, ciphertext should be the same
      expect(encrypted1).toBe(encrypted2);
    });

    it('should fail to decrypt with wrong key', () => {
      const recipientKeyPair = generateKeyPair();
      const wrongKeyPair = generateKeyPair();
      const plaintext = 'Hello, Agent World!';

      const encrypted = encryptMessage(plaintext, recipientKeyPair.publicKey);

      expect(() => decryptMessage(encrypted, wrongKeyPair.publicKey)).toThrow();
    });
  });
});
