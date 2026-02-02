import express, { Request, Response, Router } from 'express';
import { AgentClient } from './client';
import { DID, SendMessageRequest, AddContactRequest, RegisterRequest, DirectoryResponse, Status } from './types';
import { getDataDir as getDefaultDataDir, validateUsername } from './utils';
import axios from 'axios';
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, unlinkSync } from 'fs';
import { join } from 'path';

const DEFAULT_API_PORT = 5757;
const LOCK_FILE = 'daemon.lock';

export class AgentDaemon {
  private client: AgentClient;
  private app: express.Application;
  private port: number;
  private host: string;
  private dataDir: string;
  private profile?: string;
  private lockFilePath: string;

  constructor(relayUrl: string, dataDir?: string, apiPort = DEFAULT_API_PORT, apiHost = '127.0.0.1', profile?: string) {
    // Determine data directory
    if (dataDir) {
      this.dataDir = dataDir;
    } else if (profile) {
      this.dataDir = join(getDefaultDataDir(), 'profiles', profile);
    } else {
      this.dataDir = getDefaultDataDir();
    }

    this.port = apiPort;
    this.host = apiHost;
    this.profile = profile;
    this.lockFilePath = join(this.dataDir, LOCK_FILE);

    // Create client
    this.client = new AgentClient(relayUrl, this.dataDir);

    // Create Express app
    this.app = express();
    this.app.use(express.json());

    // Setup routes
    this.setupRoutes();
  }

  /**
   * Setup HTTP API routes
   */
  private setupRoutes(): void {
    // Root endpoint
    this.app.get('/', (req: Request, res: Response) => {
      res.json({
        service: 'Agent Messenger Daemon',
        version: '3.0',
        status: 'running',
        did: this.client.getDID(),
        connected: this.client.isConnected(),
        dataDir: this.dataDir,
      });
    });

    // Status endpoint
    this.app.get('/status', (req: Request, res: Response) => {
      const contacts = this.client.getContacts();
      const messages = this.client.getMessages();

      const status: Status = {
        did: this.client.getDID() || '',
        relay: this.client['relayUrl'] || '',
        connected: this.client.isConnected(),
        contacts: Object.keys(contacts).length,
        messages: messages.length,
        dataDir: this.dataDir,
        profile: this.profile || 'default',
      };

      res.json(status);
    });

    // Send message endpoint
    this.app.post('/send', async (req: Request, res: Response) => {
      try {
        const { to, toName, content } = req.body as SendMessageRequest;

        if (!content) {
          return res.status(400).json({ detail: 'Content is required' });
        }

        if (!to && !toName) {
          return res.status(400).json({ detail: 'Must specify to or to_name' });
        }

        // Resolve recipient
        let recipientDID: DID | null = null;

        if (to) {
          recipientDID = to;
        } else if (toName) {
          // Try exact match first
          recipientDID = this.client.findContactByName(toName);

          // If no exact match, try fuzzy search
          if (!recipientDID) {
            const matches = this.client.findContactsFuzzy(toName);

            if (matches.length > 0) {
              return res.status(300).json({
                status: 'ambiguous_name',
                message: `No exact match for '${toName}'. Did you mean:`,
                suggestions: matches.slice(0, 3).map(
                  m => `${m.name} (DID: ${m.did}, similarity: ${Math.round(m.score * 100)}%)`
                ),
              });
            } else {
              return res.status(404).json({ detail: `Contact not found: ${toName}` });
            }
          }
        }

        if (!recipientDID) {
          return res.status(400).json({ detail: 'Could not resolve recipient' });
        }

        const success = await this.client.sendMessage(recipientDID, content);

        if (success) {
          res.json({ status: 'sent', to: recipientDID, toName });
        } else {
          res.status(500).json({ detail: 'Failed to send message' });
        }
      } catch (error) {
        res.status(500).json({ detail: `Error: ${error}` });
      }
    });

    // Add contact endpoint
    this.app.post('/add-contact', (req: Request, res: Response) => {
      try {
        const { did, name, notes = '' } = req.body as AddContactRequest;

        if (!did || !name) {
          return res.status(400).json({ detail: 'DID and name are required' });
        }

        this.client.addContact(name, did, notes);

        res.json({ status: 'added', did, name });
      } catch (error) {
        res.status(500).json({ detail: `Error: ${error}` });
      }
    });

    // List contacts endpoint
    this.app.get('/contacts', (req: Request, res: Response) => {
      try {
        const contacts = this.client.getContacts();
        const contactsList = Object.values(contacts);

        res.json({ contacts: contactsList });
      } catch (error) {
        res.status(500).json({ detail: `Error: ${error}` });
      }
    });

    // List messages endpoint
    this.app.get('/messages', (req: Request, res: Response) => {
      try {
        const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 50;
        const from = req.query.from as string | undefined;

        const messages = this.client.getMessages(limit, from);

        res.json({ messages, count: messages.length });
      } catch (error) {
        res.status(500).json({ detail: `Error: ${error}` });
      }
    });

    // Disconnect endpoint
    this.app.post('/disconnect', (req: Request, res: Response) => {
      this.client.disconnect();
      res.json({ status: 'disconnected' });
    });

    // Reconnect endpoint
    this.app.post('/reconnect', async (req: Request, res: Response) => {
      try {
        const success = await this.client.connect();

        if (success) {
          res.json({ status: 'connected' });
        } else {
          res.status(500).json({ detail: 'Failed to connect' });
        }
      } catch (error) {
        res.status(500).json({ detail: `Error: ${error}` });
      }
    });

    // Directory endpoints
    this.app.post('/register', async (req: Request, res: Response) => {
      try {
        const { username, description = '', purpose = '', tags = [] } = req.body as RegisterRequest;

        if (!username) {
          return res.status(400).json({ detail: 'Username is required' });
        }

        // Validate username format
        if (!validateUsername(username)) {
          return res.status(400).json({
            detail:
              'Invalid username format. Must start with @, 3-20 chars, alphanumeric + underscore only',
          });
        }

        const did = this.client.getDID();
        if (!did) {
          return res.status(503).json({ detail: 'DID not available' });
        }

        // Build registration data
        const data = {
          username,
          did,
          publicKey: this.client.getPublicKeyBase64(),
          description,
          purpose,
          tags,
        };

        // Register with relay
        const relayHttpUrl = this.client['relayUrl'].replace('ws://', 'http://').replace('wss://', 'https://').replace('/ws', '');

        const response = await axios.post(`${relayHttpUrl}/directory/register`, data);

        if (response.status === 200) {
          res.json({
            status: 'registered',
            message: `Registered username '${username}' in directory`,
            username,
            did: response.data.did,
          });
        } else if (response.status === 409) {
          res.status(409).json({ detail: response.data.detail || 'Username already taken' });
        } else {
          res.status(500).json({ detail: `Registration failed: ${response.data.detail || 'Unknown error'}` });
        }
      } catch (error) {
        if (axios.isAxiosError(error)) {
          if (error.response?.status === 409) {
            return res.status(409).json({ detail: error.response.data.detail || 'Username already taken' });
          }
          return res.status(500).json({ detail: `Registration error: ${error.message}` });
        }
        res.status(500).json({ detail: `Error: ${error}` });
      }
    });

    this.app.get('/directory', async (req: Request, res: Response) => {
      try {
        const search = req.query.search as string | undefined;

        const relayHttpUrl = this.client['relayUrl'].replace('ws://', 'http://').replace('wss://', 'https://').replace('/ws', '');

        const params: Record<string, string> = {};
        if (search) {
          params.search = search;
        }

        const response = await axios.get(`${relayHttpUrl}/directory`, { params });

        if (response.status === 200) {
          res.json(response.data as DirectoryResponse);
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
  private acquireLock(): boolean {
    mkdirSync(this.dataDir, { recursive: true });

    try {
      // Try to create lock file exclusively
      writeFileSync(this.lockFilePath, process.pid.toString(), { flag: 'wx' });
      console.log(`[daemon] 🔒 Lock acquired for profile: ${this.dataDir}`);
      return true;
    } catch (error) {
      // Lock file exists, check if process is running
      try {
        const pid = parseInt(readFileSync(this.lockFilePath, 'utf-8').trim(), 10);

        // Try to send signal 0 to check if process exists
        process.kill(pid, 0);
        console.log(`[daemon] ❌ Another instance is already running (PID: ${pid})`);
        return false;
      } catch {
        // Process is dead, remove stale lock
        unlinkSync(this.lockFilePath);
        return this.acquireLock();
      }
    }
  }

  /**
   * Release lock file
   */
  private releaseLock(): void {
    if (existsSync(this.lockFilePath)) {
      unlinkSync(this.lockFilePath);
    }
  }

  /**
   * Start the daemon
   */
  async start(): Promise<void> {
    // Acquire lock
    if (!this.acquireLock()) {
      process.exit(1);
    }

    // Initialize client
    await this.client.initialize();

    // Connect to relay
    const connected = await this.client.connect();

    if (!connected) {
      console.log('[daemon] ❌ Failed to connect to relay');
      this.releaseLock();
      process.exit(1);
    }

    // Start HTTP server
    this.app.listen(this.port, this.host, () => {
      console.log(`[daemon] ✅ Daemon started`);
      console.log(`[daemon] Relay: ${this.client['relayUrl']}`);
      console.log(`[daemon] API: http://${this.host}:${this.port}`);
      console.log(`[daemon] DID: ${this.client.getDID()}`);
    });

    // Handle shutdown
    process.on('SIGINT', () => {
      console.log('[daemon] ⏹️  Shutting down...');
      this.client.disconnect();
      this.releaseLock();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('[daemon] ⏹️  Shutting down...');
      this.client.disconnect();
      this.releaseLock();
      process.exit(0);
    });
  }
}

// Helper function to write file with exclusive flag
function writeFileSync(path: string, data: string, options?: { flag?: string }): void {
  const fs = require('fs');
  fs.writeFileSync(path, data, options);
}
