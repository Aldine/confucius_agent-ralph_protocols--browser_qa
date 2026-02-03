/**
 * Confucius SDK - Core Type Definitions
 * 
 * These interfaces define the "shape" of the extension system,
 * allowing tools to be plugged into the orchestrator.
 * 
 * @see https://arxiv.org/abs/2512.10398v5 (Confucius Code Agent Paper)
 */

// ============================================================================
// Extension System Types
// ============================================================================

/**
 * IExtension - The contract for all tools in the Confucius SDK.
 * 
 * Extensions are modular components that attach to the orchestrator and
 * participate in each iteration of the agent loop. They handle:
 * - Perception: Parsing LLM output into structured actions
 * - Action: Executing tools and returning results
 * - Reasoning: (optional) Modifying prompts before LLM invocation
 */
export interface IExtension {
  /** Unique identifier for this extension */
  name: string;
  
  /** Human-readable description for documentation/UX */
  description: string;
  
  /** 
   * The XML tag this extension listens for in LLM output.
   * Example: "file_edit" matches <file_edit>...</file_edit>
   * Example: "bash" matches <bash>...</bash>
   */
  triggerTag: string;
  
  /**
   * Parse the LLM's output content for this tag.
   * Returns null if parsing fails or content is invalid.
   * 
   * @param content - The raw content between the XML tags
   * @returns Parsed action or null if invalid
   */
  parse: (content: string) => ParsedAction | null;
  
  /**
   * Execute the parsed action and return results.
   * The output string goes back into Working Memory for the next iteration.
   * 
   * @param action - The validated, parsed action
   * @param context - Runtime context with memory access
   * @returns Execution result with success status and output
   */
  execute: (action: ParsedAction, context: RunContext) => Promise<ExecutionResult>;
  
  // ---- Optional Lifecycle Callbacks (from paper Section 2.3.3) ----
  
  /**
   * Called before messages are sent to the LLM.
   * Use for prompt shaping, format instructions, or task decomposition.
   */
  onInputMessages?: (messages: Message[], context: RunContext) => Message[];
  
  /**
   * Called when plain text (non-tagged) output is received.
   */
  onPlainText?: (text: string, context: RunContext) => void;
  
  /**
   * Called after the LLM produces output, before parsing.
   * Use for logging, validation, or output transformation.
   */
  onLLMOutput?: (output: string, context: RunContext) => string;
  
  /**
   * Whether this extension signals continuation after execution.
   * If true, the orchestrator will invoke the LLM again with updated memory.
   * Default: true (most tool extensions need follow-up)
   */
  signalsContinuation?: boolean;
}

/**
 * ParsedAction - Structured representation of a tool invocation.
 * 
 * This is the output of an extension's parse() method and the input
 * to its execute() method.
 */
export interface ParsedAction {
  /** Which tool/extension this action is for */
  tool: string;
  
  /** Parameters extracted from the LLM's output */
  parameters: Record<string, unknown>;
  
  /** Original raw content for debugging */
  rawContent?: string;
}

/**
 * ExecutionResult - The outcome of running an extension's execute().
 * 
 * This goes back into Working Memory and is shown to the LLM
 * in the next iteration (AX) and to the user in logs (UX).
 */
export interface ExecutionResult {
  /** Whether the action completed successfully */
  success: boolean;
  
  /** 
   * Output to add to Working Memory (for AX).
   * Should be concise - full details go to artifacts.
   */
  output: string;
  
  /** 
   * Optional detailed output for user display (for UX).
   * Can include diffs, verbose logs, etc.
   */
  userOutput?: string;
  
  /** Optional artifacts produced (files, screenshots, etc.) */
  artifacts?: Artifact[];
  
  /** Optional error details if success is false */
  error?: ExtensionError;
}

// ============================================================================
// Memory System Types
// ============================================================================

/**
 * Message - A single entry in the conversation history.
 */
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  
  /** For tool messages, which tool produced this */
  toolName?: string;
  
  /** Timestamp for ordering and compression decisions */
  timestamp?: Date;
  
  /** Memory scope visibility */
  scope?: MemoryScope;
}

/**
 * MemoryScope - Visibility levels for hierarchical memory.
 * 
 * From paper Section 2.3.1:
 * - session: Persists across the entire session
 * - entry: Persists for a single task/entry
 * - runnable: Temporary, cleared after each tool execution
 */
export type MemoryScope = 'session' | 'entry' | 'runnable';

/**
 * WorkingMemory - The agent's current context window state.
 */
export interface WorkingMemory {
  /** All messages in the current context */
  messages: Message[];
  
  /** Current token count (approximate) */
  tokenCount: number;
  
  /** Maximum allowed tokens before compression triggers */
  maxTokens: number;
  
  /** Hierarchical notes organized by path */
  notes: Map<string, Note>;
}

/**
 * Note - A persistent knowledge artifact from the note-taking system.
 */
export interface Note {
  /** File path within the notes hierarchy */
  path: string;
  
  /** Markdown content */
  content: string;
  
  /** When this note was last updated */
  updatedAt: Date;
  
  /** Tags for retrieval */
  tags: string[];
  
  /** Is this a hindsight/failure note? */
  isHindsight?: boolean;
}

// ============================================================================
// Runtime Context Types
// ============================================================================

/**
 * RunContext - Shared context available to all extensions during execution.
 * 
 * Provides access to I/O, memory, artifacts, and session state.
 */
export interface RunContext {
  /** Current session identifier */
  sessionId: string;
  
  /** Current iteration number */
  iteration: number;
  
  /** Maximum iterations before forced termination */
  maxIterations: number;
  
  /** Access to working memory */
  memory: WorkingMemory;
  
  /** Store for artifacts produced during execution */
  artifacts: ArtifactStore;
  
  /** Logger for DX observability */
  logger: Logger;
  
  /** Configuration for the current run */
  config: RunConfig;
  
  // ---- Memory Operations ----
  
  /** Add a message to working memory */
  addMessage: (message: Message) => void;
  
  /** Read a note from memory */
  readNote: (path: string) => Note | null;
  
  /** Write a note to memory */
  writeNote: (note: Note) => void;
  
  /** Search notes by query */
  searchNotes: (query: string) => Note[];
}

/**
 * RunConfig - Configuration for an orchestrator run.
 */
export interface RunConfig {
  /** Maximum iterations before forced stop */
  maxIterations: number;
  
  /** Token threshold for triggering compression */
  compressionThreshold: number;
  
  /** Which extensions are enabled */
  enabledExtensions: string[];
  
  /** Model-specific settings */
  model: {
    provider: 'anthropic' | 'openai' | 'openai-compatible' | 'local';
    name: string;
    supportsToolUse: boolean;
  };
}

// ============================================================================
// Artifact System Types
// ============================================================================

/**
 * Artifact - A file or resource produced during execution.
 */
export interface Artifact {
  /** Unique identifier */
  id: string;
  
  /** Human-readable name */
  name: string;
  
  /** MIME type */
  mimeType: string;
  
  /** File path if persisted */
  path?: string;
  
  /** Inline content for small artifacts */
  content?: string | Buffer;
}

/**
 * ArtifactStore - Interface for managing execution artifacts.
 */
export interface ArtifactStore {
  save: (artifact: Artifact) => Promise<string>;
  get: (id: string) => Promise<Artifact | null>;
  list: () => Promise<Artifact[]>;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * ExtensionError - Structured error from extension execution.
 */
export interface ExtensionError {
  /** Error code for categorization */
  code: string;
  
  /** Human-readable message */
  message: string;
  
  /** Stack trace if available */
  stack?: string;
  
  /** Whether this error is recoverable */
  recoverable: boolean;
  
  /** Suggested recovery action */
  suggestion?: string;
}

// ============================================================================
// Logger Interface (for DX)
// ============================================================================

/**
 * Logger - Structured logging for developer observability.
 */
export interface Logger {
  debug: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
  
  /** Start a timed operation */
  startTimer: (label: string) => () => void;
}

// ============================================================================
// Orchestrator Types
// ============================================================================

/**
 * OrchestratorState - Current state of the agent loop.
 */
export interface OrchestratorState {
  /** Current iteration */
  iteration: number;
  
  /** Is the loop still running? */
  running: boolean;
  
  /** Why did the loop terminate? */
  terminationReason?: 'completed' | 'max_iterations' | 'error' | 'user_cancelled';
  
  /** Final output/artifacts */
  result?: ExecutionResult;
}

/**
 * LLMResponse - Raw response from the language model.
 */
export interface LLMResponse {
  /** The raw text output */
  content: string;
  
  /** Token usage statistics */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  
  /** Stop reason */
  stopReason: 'end_turn' | 'max_tokens' | 'tool_use' | 'stop_sequence';
}
