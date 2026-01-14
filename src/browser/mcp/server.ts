import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createLogger, type Logger } from "./logging.js";
import { loadAllowlistFromEnv, loadApprovalPolicyFromEnv, assertUrlAllowed, validateUrl, verifyApprovalTokenOrThrow } from "../runtime/allowlist.js";
import { getBrowserSession } from "../runtime/browser_session.js";

function safeUrlForLogs(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.search) u.search = "";
    if (u.hash) u.hash = "";
    return u.toString();
  } catch {
    return "[invalid-url]";
  }
}

function toolWrapper<TArgs extends Record<string, unknown>>(
  logger: Logger,
  toolName: string,
  handler: (args: TArgs, ctx: { traceId: string }) => Promise<{ content: any[]; isError?: boolean; structuredContent?: Record<string, unknown> }>
) {
  return async (args: TArgs) => {
    const traceId = logger.newTraceId();
    logger.info("tool.start", { tool: toolName, traceId, args });
    
    try {
      const result = await handler(args, { traceId });
      logger.info("tool.success", { tool: toolName, traceId });
      return result as any;
    } catch (err: any) {
      logger.error("tool.error", { 
        tool: toolName, 
        traceId, 
        error: err.message, 
        code: err.code,
        details: err.details 
      });
      
      return {
        content: [{
          type: "text",
          text: `Error (${err.code || "INTERNAL"}): ${err.message}${err.details ? `\nDetails: ${JSON.stringify(err.details)}` : ""}`
        }],
        isError: true
      } as any;
    }
  };
}

export function registerBrowserTools(server: McpServer, logger: Logger) {
  const allowlist = loadAllowlistFromEnv();
  const approvalPolicy = loadApprovalPolicyFromEnv();

  // Tool: open_url
  server.registerTool(
    "open_url",
    {
      description: "Navigate to a URL and wait for page load. Defaults to localhost origins only.",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "URL to navigate to"
          },
          wait_until: {
            type: "string",
            enum: ["load", "domcontentloaded", "networkidle"],
            description: "Wait condition (default: networkidle)",
            default: "networkidle"
          },
          approval_token: {
            type: "string",
            description: "Approval token for non-localhost URLs"
          },
          timeout_ms: {
            type: "number",
            description: "Timeout in milliseconds (default: 30000)",
            default: 30000
          }
        },
        required: ["url"]
      } as any
    },
    toolWrapper(logger, "open_url", async (args) => {
      const { url, wait_until = "networkidle", approval_token, timeout_ms = 30000 } = args as {
        url: string;
        wait_until?: "load" | "domcontentloaded" | "networkidle";
        approval_token?: string;
        timeout_ms?: number;
      };

      // Security checks
      assertUrlAllowed(url, allowlist);
      const parsed = validateUrl(url);
      verifyApprovalTokenOrThrow(approval_token, approvalPolicy, parsed);

      const session = await getBrowserSession();
      await session.client.navigate(url, wait_until);

      const title = await session.client.evaluateExpression("document.title");
      const finalUrl = await session.client.evaluateExpression("location.href");

      return {
        content: [{
          type: "text",
          text: `Navigated to ${safeUrlForLogs(finalUrl)}\nTitle: ${title}`
        }],
        structuredContent: {
          final_url: finalUrl,
          title,
          wait_until
        }
      };
    })
  );

  // Tool: screenshot
  server.registerTool(
    "screenshot",
    {
      description: "Capture a screenshot of the current page",
      inputSchema: {
        type: "object",
        properties: {
          full_page: {
            type: "boolean",
            description: "Capture full scrollable page (default: false)",
            default: false
          },
          format: {
            type: "string",
            enum: ["png"],
            description: "Image format (default: png)",
            default: "png"
          }
        }
      } as any
    },
    toolWrapper(logger, "screenshot", async (args) => {
      const { full_page = false, format = "png" } = args as {
        full_page?: boolean;
        format?: "png";
      };

      const session = await getBrowserSession();
      const pngBase64 = await session.client.screenshot(format, full_page);

      return {
        content: [{
          type: "image",
          data: pngBase64,
          mimeType: "image/png"
        }]
      };
    })
  );

  // Tool: console_errors
  server.registerTool(
    "console_errors",
    {
      description: "Get console errors from the page",
      inputSchema: {
        type: "object",
        properties: {
          include_warnings: {
            type: "boolean",
            description: "Include warnings in addition to errors (default: false)",
            default: false
          }
        }
      } as any
    },
    toolWrapper(logger, "console_errors", async (args) => {
      const { include_warnings = false } = args as {
        include_warnings?: boolean;
      };

      const session = await getBrowserSession();
      
      // Enable console domain
      await session.client.send("Runtime.enable");
      await session.client.send("Log.enable");

      // Collect console messages
      const messages: any[] = [];
      const cleanup = session.client.on((event) => {
        if (event.method === "Runtime.consoleAPICalled") {
          const params = event.params as any;
          const level = params?.type;
          if (level === "error" || (include_warnings && level === "warning")) {
            messages.push({
              level,
              message: params?.args?.map((a: any) => a.value || a.description).join(" ") || "",
              timestamp_ms: Date.now()
            });
          }
        }
      });

      // Wait a bit to collect messages
      await new Promise(resolve => setTimeout(resolve, 1000));
      cleanup();

      return {
        content: [{
          type: "text",
          text: messages.length === 0 
            ? "No console errors found" 
            : `Found ${messages.length} console error(s):\n${messages.map(m => `[${m.level}] ${m.message}`).join("\n")}`
        }],
        structuredContent: { entries: messages }
      };
    })
  );

  // Tool: contrast_audit
  server.registerTool(
    "contrast_audit",
    {
      description: "Run WCAG contrast ratio audit on the page",
      inputSchema: {
        type: "object",
        properties: {
          scope_selector: {
            type: "string",
            description: "CSS selector to limit scope (default: body)",
            default: "body"
          },
          standard: {
            type: "string",
            enum: ["WCAG21AA", "WCAG22AA"],
            description: "WCAG standard (default: WCAG21AA)",
            default: "WCAG21AA"
          }
        }
      } as any
    },
    toolWrapper(logger, "contrast_audit", async (args) => {
      const { scope_selector = "body", standard = "WCAG21AA" } = args as {
        scope_selector?: string;
        standard?: string;
      };

      const session = await getBrowserSession();

      // Inject contrast checking script
      const contrastScript = `
      (() => {
        function srgbToLin(c) {
          c /= 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        }
        
        function luminance(rgb) {
          const [r, g, b] = rgb;
          return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
        }
        
        function parseRgb(str) {
          const m = str.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/i);
          return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
        }
        
        function contrastRatio(fg, bg) {
          const L1 = luminance(fg);
          const L2 = luminance(bg);
          const light = Math.max(L1, L2);
          const dark = Math.min(L1, L2);
          return (light + 0.05) / (dark + 0.05);
        }
        
        function effectiveBackground(el) {
          let node = el;
          while (node && node !== document.documentElement) {
            const bg = getComputedStyle(node).backgroundColor;
            if (bg && !bg.includes("rgba(0, 0, 0, 0)")) return bg;
            node = node.parentElement;
          }
          return getComputedStyle(document.documentElement).backgroundColor || "rgb(255,255,255)";
        }

        const scope = document.querySelector("${scope_selector}") || document.body;
        const textElements = scope.querySelectorAll("p, h1, h2, h3, h4, h5, h6, a, button, span, label");
        
        const issues = [];
        const threshold = 4.5; // WCAG AA for normal text

        for (const el of textElements) {
          if (!el.textContent || !el.textContent.trim()) continue;
          
          const cs = getComputedStyle(el);
          const fg = parseRgb(cs.color);
          const bg = parseRgb(effectiveBackground(el));
          
          if (!fg || !bg) continue;
          
          const ratio = contrastRatio(fg, bg);
          
          if (ratio < threshold) {
            issues.push({
              selector: el.tagName.toLowerCase() + (el.className ? "." + el.className.split(" ")[0] : ""),
              text_sample: el.textContent.trim().slice(0, 50),
              fg_rgba: cs.color,
              bg_rgba: effectiveBackground(el),
              ratio: Number(ratio.toFixed(2)),
              requirement: "${standard}",
              suggested_fixes: ["Increase contrast to at least " + threshold + ":1"]
            });
          }
        }

        return issues;
      })();
      `;

      const issues = await session.client.evaluateExpression(contrastScript);

      return {
        content: [{
          type: "text",
          text: issues.length === 0 
            ? `✓ All text elements pass ${standard} contrast requirements` 
            : `Found ${issues.length} contrast issue(s):\n${issues.map((i: any) => `• ${i.selector}: ${i.ratio}:1 (${i.text_sample})`).join("\n")}`
        }],
        structuredContent: { issues }
      };
    })
  );
}

export async function runStdioServer() {
  const logger = createLogger({ name: "confucius-mcp-browser" });

  // Guardrail: route all console.log to stderr to avoid corrupting stdio JSON-RPC
  console.log = (...args: unknown[]) => {
    process.stderr.write(args.join(" ") + "\n");
  };

  const server = new McpServer({
    name: "@confucius/mcp-browser",
    version: process.env.npm_package_version ?? "0.1.0"
  });

  registerBrowserTools(server, logger);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info("server.ready", { transport: "stdio" });
}
