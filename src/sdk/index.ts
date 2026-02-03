/**
 * Confucius SDK - Main Entry Point
 * 
 * A scalable agent scaffold for real-world codebases.
 * 
 * @see https://arxiv.org/abs/2512.10398v5
 */

// Core SDK components
export { ConfuciusOrchestrator, createOrchestrator } from './orchestrator.js';
export { ExtensionRegistry, createRegistry } from './registry.js';

// Extensions
export * from './extensions/index.js';

// Memory
export * from './memory/index.js';

// Agents
export * from './agents/index.js';

// Types
export type {
  // Extension system
  IExtension,
  ParsedAction,
  ExecutionResult,
  ExtensionError,
  
  // Memory system
  Message,
  MemoryScope,
  WorkingMemory,
  Note,
  
  // Runtime
  RunContext,
  RunConfig,
  OrchestratorState,
  LLMResponse,
  
  // Artifacts
  Artifact,
  ArtifactStore,
  
  // Logging
  Logger,
} from './types.js';

// Version
export const SDK_VERSION = '2.0.0-alpha.1';
