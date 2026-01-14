import { promises as fs } from "node:fs";
import path from "node:path";

type VscodeMcpJson = {
  servers: Record<
    string,
    {
      type: "stdio";
      command: string;
      args: string[];
      env?: Record<string, string>;
      envFile?: string;
    }
  >;
  inputs?: Array<{
    id: string;
    type: "promptString";
    description: string;
    password?: boolean;
  }>;
};

type ClaudeMcpJson = {
  mcpServers: Record<
    string,
    {
      command: string;
      args: string[];
      env?: Record<string, string>;
    }
  >;
};

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile(filePath: string, obj: unknown) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const json = JSON.stringify(obj, null, 2) + "\n";
  await fs.writeFile(filePath, json, "utf8");
}

export async function writeVscodeMcpJson(opts: {
  workspaceRoot: string;
  serverName?: string;
  envFile?: string;
}) {
  const filePath = path.join(opts.workspaceRoot, ".vscode", "mcp.json");
  const existing = await readJsonFile<VscodeMcpJson>(filePath);
  const serverName = opts.serverName ?? "confucius-browser";

  const config: VscodeMcpJson = existing ?? { servers: {} };

  config.servers[serverName] = {
    type: "stdio",
    command: "npx",
    args: ["-y", "@confucius/mcp-browser", "start"],
    env: {
      CHROME_HOST: "127.0.0.1",
      CHROME_PORT: "9222",
      CONFUCIUS_ALLOW_ORIGINS: "http://localhost:5173,http://127.0.0.1:5173"
    }
  };

  if (opts.envFile) {
    config.servers[serverName].envFile = opts.envFile;
  }

  await writeJsonFile(filePath, config);
  return filePath;
}

export async function writeClaudeMcpJson(opts: {
  projectRoot: string;
  serverName?: string;
}) {
  const filePath = path.join(opts.projectRoot, ".mcp.json");
  const existing = await readJsonFile<ClaudeMcpJson>(filePath);
  const serverName = opts.serverName ?? "confucius-browser";

  const config: ClaudeMcpJson = existing ?? { mcpServers: {} };

  config.mcpServers[serverName] = {
    command: "npx",
    args: ["-y", "@confucius/mcp-browser", "start"],
    env: {
      CHROME_HOST: "127.0.0.1",
      CHROME_PORT: "9222",
      CONFUCIUS_ALLOW_ORIGINS: "http://localhost:5173,http://127.0.0.1:5173"
    }
  };

  await writeJsonFile(filePath, config);
  return filePath;
}
