#!/usr/bin/env node
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/cli.ts
import { Command } from "commander";
import axios from "axios";
var DEFAULT_API_PORT = 5757;
var DEFAULT_API_HOST = "127.0.0.1";
var DaemonClient = class {
  constructor(host = DEFAULT_API_HOST, port = DEFAULT_API_PORT) {
    this.axiosInstance = axios.create({
      baseURL: `http://${host}:${port}`,
      timeout: 1e4
    });
  }
  async get(endpoint, params) {
    const response = await this.axiosInstance.get(endpoint, { params });
    return response.data;
  }
  async post(endpoint, data) {
    var _a;
    try {
      const response = await this.axiosInstance.post(endpoint, data);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        const detail = ((_a = error.response.data) == null ? void 0 : _a.detail) || "Unknown error";
        console.log(`\u274C Error: ${detail}`);
        return null;
      }
      throw error;
    }
  }
};
async function cmdStatus(options) {
  try {
    const client = new DaemonClient(options.host, options.port);
    const status = await client.get("/status");
    console.log(`
${"=".repeat(50)}`);
    console.log("Agent Messenger Status");
    console.log(`${"=".repeat(50)}`);
    console.log(`DID: ${status.did}`);
    console.log(`Relay: ${status.relay}`);
    console.log(`Connected: ${status.connected ? "\u2705 Yes" : "\u274C No"}`);
    console.log(`Contacts: ${status.contacts}`);
    console.log(`Messages: ${status.messages}`);
    console.log(`Profile: ${status.profile}`);
    console.log(`Data Dir: ${status.dataDir}`);
    console.log(`${"=".repeat(50)}
`);
  } catch (error) {
    console.log("\u274C Cannot connect to daemon");
    console.log("   Make sure daemon is running: agentctl start-daemon --relay ws://...");
    process.exit(1);
  }
}
async function cmdSend(options, message) {
  try {
    const client = new DaemonClient(options.host, options.port);
    const requestData = { content: message };
    if (options.to) {
      requestData.to = options.to;
    } else if (options.toName) {
      requestData.to_name = options.toName;
    } else {
      console.log("\u274C Must specify --to or --to-name");
      process.exit(1);
    }
    const result = await client.post("/send", requestData);
    if (result) {
      if (result.status === "ambiguous_name") {
        console.log(`\u26A0\uFE0F  ${result.message}`);
        for (const suggestion of result.suggestions || []) {
          console.log(`   - ${suggestion}`);
        }
        process.exit(1);
      }
      const toDisplay = options.to || options.toName;
      console.log(`\u2705 Message sent to: ${toDisplay}`);
    }
  } catch (error) {
    if (axios.isAxiosError(error) && error.code === "ECONNREFUSED") {
      console.log("\u274C Cannot connect to daemon");
    } else {
      console.log("\u274C Error sending message");
    }
    process.exit(1);
  }
}
async function cmdAddContact(options) {
  try {
    const client = new DaemonClient(options.host, options.port);
    const result = await client.post("/add-contact", {
      did: options.did,
      name: options.name,
      notes: options.notes || ""
    });
    if (result) {
      console.log(`\u2705 Contact added: ${options.name} (${options.did.slice(0, 32)}...)`);
    }
  } catch (error) {
    if (axios.isAxiosError(error) && error.code === "ECONNREFUSED") {
      console.log("\u274C Cannot connect to daemon");
    } else {
      console.log("\u274C Error adding contact");
    }
    process.exit(1);
  }
}
async function cmdListContacts(options) {
  try {
    const client = new DaemonClient(options.host, options.port);
    const result = await client.get("/contacts");
    const contacts = result.contacts || [];
    console.log(`
\u{1F4CB} Contacts (${contacts.length}):`);
    console.log("-".repeat(60));
    for (const contact of contacts) {
      console.log(`
  ${contact.name}`);
      console.log(`    DID: ${contact.did}`);
      console.log(`    Added: ${contact.addedAt || "Unknown"}`);
      if (contact.notes) {
        console.log(`    Notes: ${contact.notes}`);
      }
    }
    console.log();
  } catch (error) {
    if (axios.isAxiosError(error) && error.code === "ECONNREFUSED") {
      console.log("\u274C Cannot connect to daemon");
    } else {
      console.log("\u274C Error listing contacts");
    }
    process.exit(1);
  }
}
async function cmdListMessages(options) {
  var _a, _b;
  try {
    const client = new DaemonClient(options.host, options.port);
    const result = await client.get("/messages", { limit: options.limit, from: options.sender });
    let messages = result.messages || [];
    console.log(`
\u{1F4EC} Recent Messages (${messages.length}):`);
    console.log("-".repeat(60));
    for (const msg of messages) {
      const sender = ((_a = msg.from) == null ? void 0 : _a.slice(0, 48)) || "Unknown";
      const content = ((_b = msg.content) == null ? void 0 : _b.trim()) || "";
      const timestamp = msg.timestamp ? msg.timestamp.slice(0, 19) : "";
      const isTruncated = (msg.content || "").length > 50;
      const ellipsis = isTruncated ? "..." : "";
      console.log(`
  [${timestamp}] ${sender}...`);
      console.log(`  ${content.slice(0, 50)}${ellipsis}`);
      if (isTruncated) {
        console.log(`  (trimmed, full: ${(msg.content || "").length} chars)`);
      }
    }
    console.log();
  } catch (error) {
    if (axios.isAxiosError(error) && error.code === "ECONNREFUSED") {
      console.log("\u274C Cannot connect to daemon");
    } else {
      console.log("\u274C Error listing messages");
    }
    process.exit(1);
  }
}
async function cmdGetDID(options) {
  try {
    const client = new DaemonClient(options.host, options.port);
    const status = await client.get("/status");
    console.log(status.did);
  } catch (error) {
    if (axios.isAxiosError(error) && error.code === "ECONNREFUSED") {
      console.log("\u274C Cannot connect to daemon");
    } else {
      console.log("\u274C Error getting DID");
    }
    process.exit(1);
  }
}
async function cmdRegister(options) {
  var _a;
  try {
    const client = new DaemonClient(options.host, options.port);
    const username = options.username;
    const usernameRegex = /^@[a-zA-Z0-9_]{2,19}$/;
    if (!usernameRegex.test(username)) {
      console.log("\u274C Invalid username format");
      console.log("   Must start with @");
      console.log("   3-20 characters (including @)");
      console.log("   Alphanumeric + underscore only");
      console.log("   Example: @thal, @alice_123");
      process.exit(1);
    }
    const data = {
      username,
      description: options.description || "",
      purpose: options.purpose || "",
      tags: options.tags || []
    };
    const result = await client.post("/register", data);
    if (result) {
      console.log(`\u2705 ${result.message || "Registered"}`);
      console.log(`   Username: ${result.username}`);
      console.log(`   DID: ${(result.did || "").slice(0, 32)}...`);
      if (options.description) {
        console.log(`   Description: ${options.description}`);
      }
      if (options.purpose) {
        console.log(`   Purpose: ${options.purpose}`);
      }
      if (options.tags && options.tags.length > 0) {
        console.log(`   Tags: ${options.tags.join(", ")}`);
      }
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.code === "ECONNREFUSED") {
        console.log("\u274C Cannot connect to daemon");
      } else if (((_a = error.response) == null ? void 0 : _a.status) === 409) {
        console.log(`\u274C ${error.response.data.detail || "Username already taken"}`);
      } else {
        console.log(`\u274C Error: ${error.message}`);
      }
    } else {
      console.log("\u274C Error registering");
    }
    process.exit(1);
  }
}
async function cmdDiscover(options) {
  try {
    const client = new DaemonClient(options.host, options.port);
    const params = {};
    if (options.search) {
      params.search = options.search;
    }
    const result = await client.get("/directory", params);
    if (options.format === "json") {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    if (result && result.agents) {
      const agents = result.agents;
      const count = result.count || agents.length;
      console.log(`\u{1F4D6} Agent Directory (${count} agent${count !== 1 ? "s" : ""}):`);
      console.log("=".repeat(60));
      if (!agents || agents.length === 0) {
        console.log("No agents found.");
        if (options.search) {
          console.log("\n\u{1F4A1} Try a different search term");
        } else {
          console.log(
            '\n\u{1F4A1} Be the first to register: agentctl register @username --description "AI agent" --purpose "Collaborate on projects"'
          );
        }
      } else {
        for (const agent of agents) {
          const username = agent.username || "Unknown";
          const description = agent.description || "";
          const purpose = agent.purpose || "";
          const tags = agent.tags || [];
          const registered = agent.registeredAt || "";
          console.log(`
  \u{1F916} ${username}`);
          if (description) {
            console.log(`     \u{1F4DD} ${description}`);
          }
          if (purpose) {
            console.log(`     \u{1F3AF} ${purpose}`);
          }
          if (tags && tags.length > 0) {
            console.log(`     \u{1F3F7}\uFE0F  ${tags.join(", ")}`);
          }
          console.log(`     \u{1F4C5} Registered: ${registered.slice(0, 10) || "N/A"}`);
        }
      }
      console.log();
    } else {
      console.log("\u274C Failed to query directory");
    }
  } catch (error) {
    if (axios.isAxiosError(error) && error.code === "ECONNREFUSED") {
      console.log("\u274C Cannot connect to daemon");
    } else {
      console.log("\u274C Error discovering agents");
    }
    process.exit(1);
  }
}
async function cmdShareDID(options) {
  try {
    const client = new DaemonClient(options.host, options.port);
    const status = await client.get("/status");
    const did = status.did;
    console.log(`\u{1F4F1} Share your DID:`);
    console.log(`${"=".repeat(60)}`);
    console.log(`
  DID: ${did}`);
    console.log(`
  Agent-Messenger Link:`);
    console.log(`  agent-messenger://${did}`);
    console.log(`
  QR Code (copy-paste this):`);
    console.log(`  ${did}`);
    console.log(`
  To add this contact:`);
    console.log(`  agentctl add-contact ${did} "Your Name"`);
    console.log(`${"=".repeat(60)}
`);
  } catch (error) {
    if (axios.isAxiosError(error) && error.code === "ECONNREFUSED") {
      console.log("\u274C Cannot connect to daemon");
    } else {
      console.log("\u274C Error sharing DID");
    }
    process.exit(1);
  }
}
async function cmdStartDaemon(options) {
  const { spawn } = __require("child_process");
  const path = __require("path");
  const args = ["start-daemon", "--relay", options.relay];
  if (options.profile) {
    args.push("--profile", options.profile);
  }
  if (options.dataDir) {
    args.push("--data-dir", options.dataDir);
  }
  if (options.port) {
    args.push("--port", options.port.toString());
  }
  console.log("[agentctl] Starting daemon...");
  console.log(`[agentctl] Command: agentctl ${args.join(" ")}`);
  const child = spawn(process.execPath, [path.join(__dirname, "../dist/cli.js"), ...args], {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
  console.log("[agentctl] \u2705 Daemon started");
  console.log("[agentctl] Wait a few seconds for it to initialize");
}
async function cmdStopDaemon(options) {
  console.log("[agentctl] To stop the daemon, find the process and kill it:");
  console.log('[agentctl]   Linux/macOS: pkill -f "agent-messenger"');
  console.log("[agentctl]   Windows: taskkill /F /IM node.exe");
  console.log("[agentctl] Or press Ctrl+C in the daemon terminal");
}
var program = new Command();
program.name("agentctl").description("Agent Messenger Client v3.0").version("3.0.0").option("--host <host>", "Daemon API host", DEFAULT_API_HOST).option("--port <port>", "Daemon API port", String(DEFAULT_API_PORT));
program.command("status").description("Show daemon status").action(cmdStatus);
program.command("send").description("Send a message").option("--to <did>", "Recipient DID").option("--to-name <name>", "Recipient contact name").argument("<message>", "Message content").action(cmdSend);
program.command("add-contact").description("Add a contact").argument("<did>", "Contact DID").argument("<name>", "Contact name").option("--notes <notes>", "Optional notes").action(cmdAddContact);
program.command("list-contacts").description("List all contacts").action(cmdListContacts);
program.command("list-messages").description("List recent messages").option("--limit <n>", "Max messages to show", "50").option("--sender <sender>", "Filter by sender (e.g., @user)").action(cmdListMessages);
program.command("get-did").description("Get and display DID").action(cmdGetDID);
program.command("register").description("Register username in directory").argument("<username>", "Username (e.g., @thal)").option("--description <desc>", "What you do").option("--purpose <purpose>", "Why to contact you").option("--tags <tags...>", "Tags (e.g., --tags ai coding)").action(cmdRegister);
program.command("discover").description("Discover other agents").option("--search <term>", "Search term for filtering").option("--format <format>", "Output format", "text").action(cmdDiscover);
program.command("share-did").description("Generate shareable DID link").action(cmdShareDID);
program.command("start-daemon").description("Start the daemon").requiredOption("--relay <url>", "Relay WebSocket URL").option("--profile <name>", "Profile name").option("--data-dir <dir>", "Data directory").option("--port <port>", "API port").action(cmdStartDaemon);
program.command("stop-daemon").description("Stop the daemon").action(cmdStopDaemon);
program.parse();
//# sourceMappingURL=cli.mjs.map