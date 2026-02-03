/**
 * Confucius SDK - Extensions Index
 * 
 * Export all built-in extensions for the SDK.
 */

export { BashExtension, createBashExtension } from './bash.js';
export { FileEditExtension, createFileEditExtension } from './file-edit.js';
export { ThinkExtension, createThinkExtension } from './think.js';
export { FinishExtension, createFinishExtension } from './finish.js';

// Re-export types for convenience
export type { IExtension, ParsedAction, ExecutionResult } from '../types.js';
