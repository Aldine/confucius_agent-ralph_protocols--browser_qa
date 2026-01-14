/**
 * @aldine/confucius-agent
 * 
 * Unified package combining:
 * - Ralph Protocol v3: Agent scaffold with 3-Strike Reset and Token Rot Prevention
 * - Confucius Browser: MCP server for Visual QA and accessibility testing
 * 
 * @example
 * ```typescript
 * // Import Ralph Protocol utilities
 * import { getRalphVersion } from '@aldine/confucius-agent/ralph';
 * 
 * // Import Browser MCP utilities  
 * import { runStdioServer } from '@aldine/confucius-agent/browser';
 * ```
 */

export const VERSION = "1.0.0";
export const PACKAGE_NAME = "@aldine/confucius-agent";

// Re-export from submodules for convenience
export * from "./browser/public.js";
