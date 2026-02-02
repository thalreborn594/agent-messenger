#!/usr/bin/env node
import { Command } from 'commander';
import axios, { AxiosInstance } from 'axios';
import { getDataDir as getDefaultDataDir } from './utils';

const DEFAULT_API_PORT = 5757;
const DEFAULT_API_HOST = '127.0.0.1';

class DaemonClient {
  private axiosInstance: AxiosInstance;

  constructor(host = DEFAULT_API_HOST, port = DEFAULT_API_PORT) {
    this.axiosInstance = axios.create({
      baseURL: `http://${host}:${port}`,
      timeout: 10000,
    });
  }

  async get(endpoint: string, params?: Record<string, any>): Promise<any> {
    const response = await this.axiosInstance.get(endpoint, { params });
    return response.data;
  }

  async post(endpoint: string, data?: any): Promise<any> {
    try {
      const response = await this.axiosInstance.post(endpoint, data);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        const detail = error.response.data?.detail || 'Unknown error';
        console.log(`❌ Error: ${detail}`);
        return null;
      }
      throw error;
    }
  }
}

// Commands
async function cmdStatus(options: any): Promise<void> {
  try {
    const client = new DaemonClient(options.host, options.port);
    const status = await client.get('/status');

    console.log(`\n${'='.repeat(50)}`);
    console.log('Agent Messenger Status');
    console.log(`${'='.repeat(50)}`);
    console.log(`DID: ${status.did}`);
    console.log(`Relay: ${status.relay}`);
    console.log(`Connected: ${status.connected ? '✅ Yes' : '❌ No'}`);
    console.log(`Contacts: ${status.contacts}`);
    console.log(`Messages: ${status.messages}`);
    console.log(`Profile: ${status.profile}`);
    console.log(`Data Dir: ${status.dataDir}`);
    console.log(`${'='.repeat(50)}\n`);
  } catch (error) {
    console.log('❌ Cannot connect to daemon');
    console.log('   Make sure daemon is running: agentctl start-daemon --relay ws://...');
    process.exit(1);
  }
}

async function cmdSend(options: any, message: string): Promise<void> {
  try {
    const client = new DaemonClient(options.host, options.port);

    const requestData: any = { content: message };

    if (options.to) {
      requestData.to = options.to;
    } else if (options.toName) {
      requestData.to_name = options.toName;
    } else {
      console.log('❌ Must specify --to or --to-name');
      process.exit(1);
    }

    const result = await client.post('/send', requestData);

    if (result) {
      if (result.status === 'ambiguous_name') {
        console.log(`⚠️  ${result.message}`);
        for (const suggestion of result.suggestions || []) {
          console.log(`   - ${suggestion}`);
        }
        process.exit(1);
      }

      const toDisplay = options.to || options.toName;
      console.log(`✅ Message sent to: ${toDisplay}`);
    }
  } catch (error) {
    if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
      console.log('❌ Cannot connect to daemon');
    } else {
      console.log('❌ Error sending message');
    }
    process.exit(1);
  }
}

async function cmdAddContact(options: any): Promise<void> {
  try {
    const client = new DaemonClient(options.host, options.port);
    const result = await client.post('/add-contact', {
      did: options.did,
      name: options.name,
      notes: options.notes || '',
    });

    if (result) {
      console.log(`✅ Contact added: ${options.name} (${options.did.slice(0, 32)}...)`);
    }
  } catch (error) {
    if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
      console.log('❌ Cannot connect to daemon');
    } else {
      console.log('❌ Error adding contact');
    }
    process.exit(1);
  }
}

async function cmdListContacts(options: any): Promise<void> {
  try {
    const client = new DaemonClient(options.host, options.port);
    const result = await client.get('/contacts');

    const contacts = result.contacts || [];

    console.log(`\n📋 Contacts (${contacts.length}):`);
    console.log('-'.repeat(60));

    for (const contact of contacts) {
      console.log(`\n  ${contact.name}`);
      console.log(`    DID: ${contact.did}`);
      console.log(`    Added: ${contact.addedAt || 'Unknown'}`);
      if (contact.notes) {
        console.log(`    Notes: ${contact.notes}`);
      }
    }

    console.log();
  } catch (error) {
    if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
      console.log('❌ Cannot connect to daemon');
    } else {
      console.log('❌ Error listing contacts');
    }
    process.exit(1);
  }
}

async function cmdListMessages(options: any): Promise<void> {
  try {
    const client = new DaemonClient(options.host, options.port);
    const result = await client.get('/messages', { limit: options.limit, from: options.sender });

    let messages = result.messages || [];

    console.log(`\n📬 Recent Messages (${messages.length}):`);
    console.log('-'.repeat(60));

    for (const msg of messages) {
      const sender = msg.from?.slice(0, 48) || 'Unknown';
      const content = msg.content?.trim() || '';
      const timestamp = msg.timestamp ? msg.timestamp.slice(0, 19) : '';

      const isTruncated = (msg.content || '').length > 50;
      const ellipsis = isTruncated ? '...' : '';

      console.log(`\n  [${timestamp}] ${sender}...`);
      console.log(`  ${content.slice(0, 50)}${ellipsis}`);
      if (isTruncated) {
        console.log(`  (trimmed, full: ${(msg.content || '').length} chars)`);
      }
    }

    console.log();
  } catch (error) {
    if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
      console.log('❌ Cannot connect to daemon');
    } else {
      console.log('❌ Error listing messages');
    }
    process.exit(1);
  }
}

async function cmdGetDID(options: any): Promise<void> {
  try {
    const client = new DaemonClient(options.host, options.port);
    const status = await client.get('/status');

    console.log(status.did);
  } catch (error) {
    if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
      console.log('❌ Cannot connect to daemon');
    } else {
      console.log('❌ Error getting DID');
    }
    process.exit(1);
  }
}

async function cmdRegister(options: any): Promise<void> {
  try {
    const client = new DaemonClient(options.host, options.port);

    // Validate username format
    const username = options.username;
    const usernameRegex = /^@[a-zA-Z0-9_]{2,19}$/;
    if (!usernameRegex.test(username)) {
      console.log('❌ Invalid username format');
      console.log('   Must start with @');
      console.log('   3-20 characters (including @)');
      console.log('   Alphanumeric + underscore only');
      console.log('   Example: @thal, @alice_123');
      process.exit(1);
    }

    const data: any = {
      username,
      description: options.description || '',
      purpose: options.purpose || '',
      tags: options.tags || [],
    };

    const result = await client.post('/register', data);

    if (result) {
      console.log(`✅ ${result.message || 'Registered'}`);
      console.log(`   Username: ${result.username}`);
      console.log(`   DID: ${(result.did || '').slice(0, 32)}...`);
      if (options.description) {
        console.log(`   Description: ${options.description}`);
      }
      if (options.purpose) {
        console.log(`   Purpose: ${options.purpose}`);
      }
      if (options.tags && options.tags.length > 0) {
        console.log(`   Tags: ${options.tags.join(', ')}`);
      }
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNREFUSED') {
        console.log('❌ Cannot connect to daemon');
      } else if (error.response?.status === 409) {
        console.log(`❌ ${error.response.data.detail || 'Username already taken'}`);
      } else {
        console.log(`❌ Error: ${error.message}`);
      }
    } else {
      console.log('❌ Error registering');
    }
    process.exit(1);
  }
}

async function cmdDiscover(options: any): Promise<void> {
  try {
    const client = new DaemonClient(options.host, options.port);

    const params: any = {};
    if (options.search) {
      params.search = options.search;
    }

    const result = await client.get('/directory', params);

    if (options.format === 'json') {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    // Text format
    if (result && result.agents) {
      const agents = result.agents;
      const count = result.count || agents.length;

      console.log(`📖 Agent Directory (${count} agent${count !== 1 ? 's' : ''}):`);
      console.log('='.repeat(60));

      if (!agents || agents.length === 0) {
        console.log('No agents found.');
        if (options.search) {
          console.log('\n💡 Try a different search term');
        } else {
          console.log(
            '\n💡 Be the first to register: agentctl register @username --description "AI agent" --purpose "Collaborate on projects"'
          );
        }
      } else {
        for (const agent of agents) {
          const username = agent.username || 'Unknown';
          const description = agent.description || '';
          const purpose = agent.purpose || '';
          const tags = agent.tags || [];
          const registered = agent.registeredAt || '';

          console.log(`\n  🤖 ${username}`);
          if (description) {
            console.log(`     📝 ${description}`);
          }
          if (purpose) {
            console.log(`     🎯 ${purpose}`);
          }
          if (tags && tags.length > 0) {
            console.log(`     🏷️  ${tags.join(', ')}`);
          }
          console.log(`     📅 Registered: ${registered.slice(0, 10) || 'N/A'}`);
        }
      }
      console.log();
    } else {
      console.log('❌ Failed to query directory');
    }
  } catch (error) {
    if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
      console.log('❌ Cannot connect to daemon');
    } else {
      console.log('❌ Error discovering agents');
    }
    process.exit(1);
  }
}

async function cmdShareDID(options: any): Promise<void> {
  try {
    const client = new DaemonClient(options.host, options.port);
    const status = await client.get('/status');

    const did = status.did;

    console.log(`📱 Share your DID:`);
    console.log(`${'='.repeat(60)}`);
    console.log(`\n  DID: ${did}`);
    console.log(`\n  Agent-Messenger Link:`);
    console.log(`  agent-messenger://${did}`);
    console.log(`\n  QR Code (copy-paste this):`);
    console.log(`  ${did}`);
    console.log(`\n  To add this contact:`);
    console.log(`  agentctl add-contact ${did} "Your Name"`);
    console.log(`${'='.repeat(60)}\n`);
  } catch (error) {
    if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
      console.log('❌ Cannot connect to daemon');
    } else {
      console.log('❌ Error sharing DID');
    }
    process.exit(1);
  }
}

async function cmdStartDaemon(options: any): Promise<void> {
  const { spawn } = require('child_process');
  const path = require('path');

  const args = ['start-daemon', '--relay', options.relay];

  if (options.profile) {
    args.push('--profile', options.profile);
  }

  if (options.dataDir) {
    args.push('--data-dir', options.dataDir);
  }

  if (options.port) {
    args.push('--port', options.port.toString());
  }

  console.log('[agentctl] Starting daemon...');
  console.log(`[agentctl] Command: agentctl ${args.join(' ')}`);

  const child = spawn(process.execPath, [path.join(__dirname, '../dist/cli.js'), ...args], {
    detached: true,
    stdio: 'ignore',
  });

  child.unref();

  console.log('[agentctl] ✅ Daemon started');
  console.log('[agentctl] Wait a few seconds for it to initialize');
}

async function cmdStopDaemon(options: any): Promise<void> {
  console.log('[agentctl] To stop the daemon, find the process and kill it:');
  console.log('[agentctl]   Linux/macOS: pkill -f "agent-messenger"');
  console.log('[agentctl]   Windows: taskkill /F /IM node.exe');
  console.log('[agentctl] Or press Ctrl+C in the daemon terminal');
}

// Main program
const program = new Command();

program
  .name('agentctl')
  .description('Agent Messenger Client v3.0')
  .version('3.0.0')
  .option('--host <host>', 'Daemon API host', DEFAULT_API_HOST)
  .option('--port <port>', 'Daemon API port', String(DEFAULT_API_PORT));

program
  .command('status')
  .description('Show daemon status')
  .action(cmdStatus);

program
  .command('send')
  .description('Send a message')
  .option('--to <did>', 'Recipient DID')
  .option('--to-name <name>', 'Recipient contact name')
  .argument('<message>', 'Message content')
  .action(cmdSend);

program
  .command('add-contact')
  .description('Add a contact')
  .argument('<did>', 'Contact DID')
  .argument('<name>', 'Contact name')
  .option('--notes <notes>', 'Optional notes')
  .action(cmdAddContact);

program
  .command('list-contacts')
  .description('List all contacts')
  .action(cmdListContacts);

program
  .command('list-messages')
  .description('List recent messages')
  .option('--limit <n>', 'Max messages to show', '50')
  .option('--sender <sender>', 'Filter by sender (e.g., @user)')
  .action(cmdListMessages);

program
  .command('get-did')
  .description('Get and display DID')
  .action(cmdGetDID);

program
  .command('register')
  .description('Register username in directory')
  .argument('<username>', 'Username (e.g., @thal)')
  .option('--description <desc>', 'What you do')
  .option('--purpose <purpose>', 'Why to contact you')
  .option('--tags <tags...>', 'Tags (e.g., --tags ai coding)')
  .action(cmdRegister);

program
  .command('discover')
  .description('Discover other agents')
  .option('--search <term>', 'Search term for filtering')
  .option('--format <format>', 'Output format', 'text')
  .action(cmdDiscover);

program
  .command('share-did')
  .description('Generate shareable DID link')
  .action(cmdShareDID);

program
  .command('start-daemon')
  .description('Start the daemon')
  .requiredOption('--relay <url>', 'Relay WebSocket URL')
  .option('--profile <name>', 'Profile name')
  .option('--data-dir <dir>', 'Data directory')
  .option('--port <port>', 'API port')
  .action(cmdStartDaemon);

program
  .command('stop-daemon')
  .description('Stop the daemon')
  .action(cmdStopDaemon);

program.parse();
