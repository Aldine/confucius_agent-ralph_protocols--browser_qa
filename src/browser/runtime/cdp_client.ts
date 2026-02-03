import WebSocket from "ws";

type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

type Pending = {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  method: string;
};

type CdpEvent = {
  method: string;
  params?: Json;
  sessionId?: string;
};

type CdpResponse = {
  id: number;
  result?: Json;
  error?: { code: number; message: string; data?: Json };
};

export type ConnectOptions = {
  host?: string;
  port?: number;
  timeoutMs?: number;
};

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}

type JsonVersion = { webSocketDebuggerUrl?: string };
type JsonTarget = {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl?: string;
};

export class CdpClient {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private listeners: Array<(event: CdpEvent) => void> = [];

  constructor(private wsUrl: string) {}

  async connect(timeoutMs = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("CDP connection timeout"));
      }, timeoutMs);

      this.ws = new WebSocket(this.wsUrl);

      this.ws.on("open", () => {
        clearTimeout(timeout);
        resolve();
      });

      this.ws.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      this.ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString()) as CdpResponse | CdpEvent;
          
          if ("id" in msg) {
            // Response
            const pending = this.pending.get(msg.id);
            if (pending) {
              this.pending.delete(msg.id);
              if (msg.error) {
                const err: any = new Error(msg.error.message);
                err.code = "CDP_ERROR";
                err.details = msg.error;
                pending.reject(err);
              } else {
                pending.resolve(msg.result);
              }
            }
          } else if ("method" in msg) {
            // Event
            for (const listener of this.listeners) {
              listener(msg);
            }
          }
        } catch (err) {
          console.error("Failed to parse CDP message:", err);
        }
      });
    });
  }

  async send(method: string, params?: Json): Promise<any> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("CDP connection not open");
    }

    const id = this.nextId++;
    const message = JSON.stringify({ id, method, params });

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.ws!.send(message);
    });
  }

  on(listener: (event: CdpEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) this.listeners.splice(index, 1);
    };
  }

  async close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // High-level helpers
  async navigate(url: string, waitUntil: "load" | "domcontentloaded" | "networkidle" = "networkidle"): Promise<string> {
    await this.send("Page.enable");
    await this.send("Network.enable");

    const { frameId } = await this.send("Page.navigate", { url });

    if (waitUntil === "networkidle") {
      await this.waitForNetworkIdle(1000, 30000);
    } else {
      await this.waitForEvent("Page.loadEventFired", 30000);
    }

    return frameId;
  }

  async waitForNetworkIdle(idleMs: number, timeoutMs: number): Promise<void> {
    let activeRequests = 0;
    let lastActivityTime = Date.now();
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkIdle = setInterval(() => {
        const elapsed = Date.now() - startTime;
        if (elapsed > timeoutMs) {
          clearInterval(checkIdle);
          reject(new Error("Network idle timeout"));
          return;
        }

        const idleDuration = Date.now() - lastActivityTime;
        if (activeRequests === 0 && idleDuration >= idleMs) {
          clearInterval(checkIdle);
          resolve();
        }
      }, 100);

      const cleanup = this.on((event) => {
        if (event.method === "Network.requestWillBeSent") {
          activeRequests++;
          lastActivityTime = Date.now();
        } else if (event.method === "Network.loadingFinished" || event.method === "Network.loadingFailed") {
          activeRequests = Math.max(0, activeRequests - 1);
          lastActivityTime = Date.now();
        }
      });

      setTimeout(() => {
        cleanup();
      }, timeoutMs + 1000);
    });
  }

  async waitForEvent(method: string, timeoutMs: number): Promise<CdpEvent> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout waiting for event: ${method}`));
      }, timeoutMs);

      const cleanup = this.on((event) => {
        if (event.method === method) {
          clearTimeout(timeout);
          cleanup();
          resolve(event);
        }
      });
    });
  }

  async screenshot(format: "png" | "jpeg" = "png", fullPage = false): Promise<string> {
    await this.send("Page.enable");
    
    const result = await this.send("Page.captureScreenshot", {
      format,
      captureBeyondViewport: fullPage,
    });

    return result.data;
  }

  async getDocument(): Promise<any> {
    const { root } = await this.send("DOM.getDocument");
    return root;
  }

  async querySelector(selector: string): Promise<number | null> {
    const doc = await this.getDocument();
    const { nodeId } = await this.send("DOM.querySelector", {
      nodeId: doc.nodeId,
      selector,
    });
    return nodeId || null;
  }

  async getComputedStyle(nodeId: number): Promise<Record<string, string>> {
    const { computedStyle } = await this.send("CSS.getComputedStyleForNode", { nodeId });
    const result: Record<string, string> = {};
    for (const prop of computedStyle) {
      result[prop.name] = prop.value;
    }
    return result;
  }

  async evaluateExpression(expression: string): Promise<any> {
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });

    if (result.exceptionDetails) {
      throw new Error(`Runtime evaluation failed: ${result.exceptionDetails.text}`);
    }

    return result.result.value;
  }
}

export async function connectOrThrow(opts: ConnectOptions = {}): Promise<CdpClient> {
  const host = opts.host ?? "127.0.0.1";
  const port = opts.port ?? 9222;
  const timeoutMs = opts.timeoutMs ?? 10000;

  try {
    const versionUrl = `http://${host}:${port}/json/version`;
    const version = await fetchJson<JsonVersion>(versionUrl, timeoutMs);

    if (version.webSocketDebuggerUrl) {
      const client = new CdpClient(version.webSocketDebuggerUrl);
      await client.connect(timeoutMs);
      return client;
    }

    // Fallback: get first available target
    const targetsUrl = `http://${host}:${port}/json`;
    const targets = await fetchJson<JsonTarget[]>(targetsUrl, timeoutMs);
    
    const pageTarget = targets.find(t => t.type === "page" && t.webSocketDebuggerUrl);
    if (!pageTarget || !pageTarget.webSocketDebuggerUrl) {
      throw new Error("No debuggable page target found");
    }

    const client = new CdpClient(pageTarget.webSocketDebuggerUrl);
    await client.connect(timeoutMs);
    return client;

  } catch (err: any) {
    const error: any = new Error(`Failed to connect to Chrome DevTools at ${host}:${port}`);
    error.code = "BROWSER_NOT_DEBUGGABLE";
    error.details = { host, port, originalError: err.message };
    throw error;
  }
}
