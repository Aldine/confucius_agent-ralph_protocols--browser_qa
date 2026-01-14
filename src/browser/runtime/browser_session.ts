import { CdpClient, connectOrThrow } from "./cdp_client.js";

export type BrowserSession = {
  client: CdpClient;
  host: string;
  port: number;
};

let cached: BrowserSession | null = null;

export async function getBrowserSession(): Promise<BrowserSession> {
  if (cached) return cached;

  const host = process.env.CHROME_HOST ?? "127.0.0.1";
  const port = parseInt(process.env.CHROME_PORT ?? "9222", 10);

  const client = await connectOrThrow({ host, port, timeoutMs: 10000 });
  
  cached = { client, host, port };
  return cached;
}

export async function resetBrowserSession() {
  if (cached) {
    await cached.client.close();
    cached = null;
  }
}
