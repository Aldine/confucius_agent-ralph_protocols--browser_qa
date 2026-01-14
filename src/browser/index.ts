#!/usr/bin/env node
import { Command } from "commander";
import process from "node:process";
import path from "node:path";
import { runStdioServer } from "./mcp/server.js";
import { writeClaudeMcpJson, writeVscodeMcpJson } from "./cli/config-writers.js";

const program = new Command();

program
  .name("confucius-browser")
  .description("Confucius Browser MCP server + CLI")
  .version("0.1.0");

program
  .command("init")
  .description("Initialize MCP configuration for a host")
  .option("--host <host>", "Target host: vscode or claude", "vscode")
  .option("--workspace <path>", "Workspace root directory", process.cwd())
  .option("--server-name <name>", "Server name in config", "confucius-browser")
  .action(async (opts) => {
    try {
      let configPath: string;
      
      if (opts.host === "vscode") {
        configPath = await writeVscodeMcpJson({
          workspaceRoot: opts.workspace,
          serverName: opts.serverName
        });
        console.log(`✓ Created VS Code MCP config: ${configPath}`);
        console.log("\nNext steps:");
        console.log("  1. Start Chrome with remote debugging:");
        console.log("     chrome --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1");
        console.log("  2. Reload VS Code window");
        console.log("  3. Use Copilot chat with MCP tools");
      } else if (opts.host === "claude") {
        configPath = await writeClaudeMcpJson({
          projectRoot: opts.workspace,
          serverName: opts.serverName
        });
        console.log(`✓ Created Claude MCP config: ${configPath}`);
        console.log("\nNext steps:");
        console.log("  1. Start Chrome with remote debugging:");
        console.log("     chrome --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1");
        console.log("  2. Open project in Claude Code");
        console.log("  3. Use MCP tools in chat");
      } else {
        console.error(`Unknown host: ${opts.host}. Use 'vscode' or 'claude'.`);
        process.exit(1);
      }
    } catch (err: any) {
      console.error("Failed to initialize config:", err.message);
      process.exit(1);
    }
  });

program
  .command("doctor")
  .description("Check if Chrome is accessible and configuration is correct")
  .action(async () => {
    try {
      const host = process.env.CHROME_HOST ?? "127.0.0.1";
      const port = process.env.CHROME_PORT ?? "9222";

      console.log("🔍 Checking Chrome DevTools connection...");
      console.log(`   Host: ${host}`);
      console.log(`   Port: ${port}`);

      const url = `http://${host}:${port}/json/version`;
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      
      if (response.ok) {
        const data = await response.json() as any;
        console.log("\n✓ Chrome is accessible");
        console.log(`   Browser: ${data.Browser}`);
        console.log(`   Protocol: ${data["Protocol-Version"]}`);
        console.log(`   WebSocket: ${data.webSocketDebuggerUrl ? "Available" : "Not available"}`);
        
        // Check allowlist
        const allowlist = process.env.CONFUCIUS_ALLOW_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173";
        console.log(`\n✓ Allowlist: ${allowlist}`);
        
        console.log("\n✓ All checks passed!");
        process.exit(0);
      } else {
        console.error(`\n✗ Chrome returned status ${response.status}`);
        process.exit(1);
      }
    } catch (err: any) {
      console.error("\n✗ Cannot connect to Chrome DevTools");
      console.error(`   Error: ${err.message}`);
      console.error("\nTo fix:");
      console.error("  1. Start Chrome with:");
      console.error("     chrome --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1");
      console.error("  2. Or set CHROME_PORT to match your Chrome debugging port");
      process.exit(1);
    }
  });

program
  .command("start")
  .description("Start the MCP server (stdio transport)")
  .action(async () => {
    try {
      await runStdioServer();
    } catch (err: any) {
      process.stderr.write(`Fatal: ${err.message}\n`);
      process.exit(1);
    }
  });

program.parseAsync(process.argv).catch((err) => {
  console.error("Command failed:", err.message);
  process.exit(1);
});
