/**
 * Confucius SDK - Hierarchical Working Memory Manager
 * 
 * Implements the three-scope memory architecture from the Confucius paper:
 * 
 * 1. SESSION SCOPE - Immutable system instructions and global rules
 *    - System prompt, tool definitions, persona
 *    - Never cleared during execution
 * 
 * 2. ENTRY SCOPE - High-level task description and plan
 *    - User's original request
 *    - Decomposed subtasks
 *    - Persistent across retries within same entry
 * 
 * 3. RUNNABLE SCOPE - Active execution trace
 *    - Tool invocations and results
 *    - Current reasoning steps
 *    - Can be cleared/compressed without losing context
 * 
 * @see https://arxiv.org/abs/2512.10398v5 Section 2.3.1
 */

import type { WorkingMemory, Message, Note, MemoryScope, Logger } from '../types.js';

/**
 * HierarchicalMemory - Internal structure for scope-based storage.
 */
interface HierarchicalMemory {
  /** Immutable system instructions */
  session: Message[];
  
  /** High-level task and plan */
  entry: Message[];
  
  /** Active execution trace */
  runnable: Message[];
  
  /** Token counts per scope */
  tokenCounts: {
    session: number;
    entry: number;
    runnable: number;
  };
  
  /** Maximum tokens before compression */
  maxTokens: number;
  
  /** Persistent notes storage */
  notes: Map<string, Note>;
}

/**
 * WorkingMemoryManager - Manages the agent's hierarchical context window.
 * 
 * Memory is organized into three scopes with different lifecycles:
 * - Session: Set once at initialization, never modified
 * - Entry: Set when task starts, persists across retries
 * - Runnable: Updated each iteration, can be cleared/compressed
 */
export class WorkingMemoryManager {
  private memory: HierarchicalMemory;
  private logger: Logger;

  constructor(logger: Logger, maxTokens: number = 100000) {
    this.logger = logger;
    this.memory = {
      session: [],
      entry: [],
      runnable: [],
      tokenCounts: {
        session: 0,
        entry: 0,
        runnable: 0,
      },
      maxTokens,
      notes: new Map(),
    };
  }

  /**
   * Get the legacy WorkingMemory interface for compatibility.
   * Concatenates all scopes into a single messages array.
   */
  getMemory(): WorkingMemory {
    return {
      messages: this.getMessages(),
      tokenCount: this.getTotalTokenCount(),
      maxTokens: this.memory.maxTokens,
      notes: this.memory.notes,
    };
  }

  /**
   * Get all messages concatenated in scope order: Session + Entry + Runnable.
   * This is the primary method for building LLM context.
   */
  getMessages(): Message[] {
    return [
      ...this.memory.session,
      ...this.memory.entry,
      ...this.memory.runnable,
    ];
  }

  /**
   * Get messages from a specific scope only.
   */
  getMessagesByScope(scope: MemoryScope): Message[] {
    switch (scope) {
      case 'session':
        return [...this.memory.session];
      case 'entry':
        return [...this.memory.entry];
      case 'runnable':
        return [...this.memory.runnable];
      default:
        return [];
    }
  }

  /**
   * Get total token count across all scopes.
   */
  getTotalTokenCount(): number {
    return (
      this.memory.tokenCounts.session +
      this.memory.tokenCounts.entry +
      this.memory.tokenCounts.runnable
    );
  }

  /**
   * Get token count for a specific scope.
   */
  getTokenCount(scope: MemoryScope): number {
    return this.memory.tokenCounts[scope];
  }

  /**
   * Add a message to the appropriate scope.
   */
  addMessage(message: Message): void {
    const scope = message.scope || 'runnable';
    const messageWithMeta: Message = {
      ...message,
      timestamp: message.timestamp || new Date(),
      scope,
    };

    // Route to appropriate scope
    switch (scope) {
      case 'session':
        this.memory.session.push(messageWithMeta);
        break;
      case 'entry':
        this.memory.entry.push(messageWithMeta);
        break;
      case 'runnable':
      default:
        this.memory.runnable.push(messageWithMeta);
        break;
    }

    // Update token count for the scope
    const tokens = this.estimateTokens(message.content);
    this.memory.tokenCounts[scope] += tokens;

    this.logger.debug('Message added to memory', {
      role: message.role,
      scope,
      tokens,
      totalTokens: this.getTotalTokenCount(),
    });
  }

  /**
   * Initialize session scope with system prompt.
   * Should only be called once at the start.
   */
  initializeSession(systemPrompt: string): void {
    if (this.memory.session.length > 0) {
      this.logger.warn('Session scope already initialized, skipping');
      return;
    }

    this.addMessage({
      role: 'system',
      content: systemPrompt,
      scope: 'session',
    });

    this.logger.info('Session scope initialized', {
      tokens: this.memory.tokenCounts.session,
    });
  }

  /**
   * Set the entry scope with the user's task.
   * Clears any previous entry content.
   */
  setEntry(task: string): void {
    // Clear existing entry
    this.memory.entry = [];
    this.memory.tokenCounts.entry = 0;

    this.addMessage({
      role: 'user',
      content: task,
      scope: 'entry',
    });

    this.logger.info('Entry scope set', {
      taskPreview: task.substring(0, 100),
      tokens: this.memory.tokenCounts.entry,
    });
  }

  /**
   * Add a message to runnable scope (most common operation).
   */
  addToRunnable(message: Omit<Message, 'scope'>): void {
    this.addMessage({
      ...message,
      scope: 'runnable',
    });
  }

  /**
   * Clear runnable scope (e.g., after compression or retry).
   */
  clearRunnable(): void {
    const clearedCount = this.memory.runnable.length;
    const clearedTokens = this.memory.tokenCounts.runnable;

    this.memory.runnable = [];
    this.memory.tokenCounts.runnable = 0;

    if (clearedCount > 0) {
      this.logger.info('Runnable scope cleared', {
        messages: clearedCount,
        tokens: clearedTokens,
      });
    }
  }

  /**
   * Clear a specific scope.
   */
  clearScope(scope: MemoryScope): void {
    switch (scope) {
      case 'session':
        this.logger.warn('Clearing session scope is not recommended');
        this.memory.session = [];
        this.memory.tokenCounts.session = 0;
        break;
      case 'entry':
        this.memory.entry = [];
        this.memory.tokenCounts.entry = 0;
        break;
      case 'runnable':
        this.clearRunnable();
        break;
    }
  }

  /**
   * Check if compression is needed based on runnable scope size.
   */
  needsCompression(threshold: number): boolean {
    return this.getTotalTokenCount() > threshold;
  }

  /**
   * Get runnable token count (most likely to need compression).
   */
  getRunnableTokenCount(): number {
    return this.memory.tokenCounts.runnable;
  }

  /**
   * Replace runnable scope with compressed version.
   */
  compressRunnable(compressedMessages: Message[]): void {
    const oldCount = this.memory.runnable.length;
    const oldTokens = this.memory.tokenCounts.runnable;

    this.memory.runnable = compressedMessages.map(m => ({
      ...m,
      scope: 'runnable' as MemoryScope,
    }));

    this.memory.tokenCounts.runnable = compressedMessages.reduce(
      (sum, m) => sum + this.estimateTokens(m.content),
      0
    );

    this.logger.info('Runnable scope compressed', {
      messagesBefore: oldCount,
      messagesAfter: this.memory.runnable.length,
      tokensBefore: oldTokens,
      tokensAfter: this.memory.tokenCounts.runnable,
    });
  }

  /**
   * Replace runnable scope with a single summary message.
   * Convenience method for Architect-based compression.
   */
  replaceRunnableWithSummary(summary: string): void {
    const summaryMessage: Message = {
      role: 'system',
      content: `[PREVIOUS CONTEXT SUMMARY]:\n${summary}`,
      timestamp: new Date(),
      scope: 'runnable',
    };
    this.compressRunnable([summaryMessage]);
  }

  /**
   * Get runnable messages (alias for getMessagesByScope('runnable')).
   */
  getRunnableMessages(): Message[] {
    return this.getMessagesByScope('runnable');
  }

  /**
   * Get a note by path.
   */
  getNote(path: string): Note | undefined {
    return this.memory.notes.get(path);
  }

  /**
   * Set a note.
   */
  setNote(note: Note): void {
    this.memory.notes.set(note.path, {
      ...note,
      updatedAt: new Date(),
    });
    this.logger.debug('Note saved', { path: note.path });
  }

  /**
   * Search notes by content or tags.
   */
  searchNotes(query: string): Note[] {
    const results: Note[] = [];
    const queryLower = query.toLowerCase();

    for (const note of this.memory.notes.values()) {
      if (
        note.content.toLowerCase().includes(queryLower) ||
        note.tags.some(t => t.toLowerCase().includes(queryLower)) ||
        note.path.toLowerCase().includes(queryLower)
      ) {
        results.push(note);
      }
    }

    return results;
  }

  /**
   * Get memory statistics for debugging/monitoring.
   */
  getStats(): {
    scopes: {
      session: { messages: number; tokens: number };
      entry: { messages: number; tokens: number };
      runnable: { messages: number; tokens: number };
    };
    total: { messages: number; tokens: number };
    notes: number;
  } {
    return {
      scopes: {
        session: {
          messages: this.memory.session.length,
          tokens: this.memory.tokenCounts.session,
        },
        entry: {
          messages: this.memory.entry.length,
          tokens: this.memory.tokenCounts.entry,
        },
        runnable: {
          messages: this.memory.runnable.length,
          tokens: this.memory.tokenCounts.runnable,
        },
      },
      total: {
        messages: this.getMessages().length,
        tokens: this.getTotalTokenCount(),
      },
      notes: this.memory.notes.size,
    };
  }

  /**
   * Export memory state for persistence.
   */
  export(): {
    session: Message[];
    entry: Message[];
    runnable: Message[];
    notes: Array<[string, Note]>;
    tokenCounts: HierarchicalMemory['tokenCounts'];
  } {
    return {
      session: [...this.memory.session],
      entry: [...this.memory.entry],
      runnable: [...this.memory.runnable],
      notes: Array.from(this.memory.notes.entries()),
      tokenCounts: { ...this.memory.tokenCounts },
    };
  }

  /**
   * Import memory state.
   */
  import(state: {
    session?: Message[];
    entry?: Message[];
    runnable?: Message[];
    notes?: Array<[string, Note]>;
    tokenCounts?: Partial<HierarchicalMemory['tokenCounts']>;
  }): void {
    if (state.session) {
      this.memory.session = [...state.session];
    }
    if (state.entry) {
      this.memory.entry = [...state.entry];
    }
    if (state.runnable) {
      this.memory.runnable = [...state.runnable];
    }
    if (state.notes) {
      this.memory.notes = new Map(state.notes);
    }

    // Recalculate or use provided token counts
    if (state.tokenCounts) {
      this.memory.tokenCounts = {
        session: state.tokenCounts.session ?? this.calculateScopeTokens('session'),
        entry: state.tokenCounts.entry ?? this.calculateScopeTokens('entry'),
        runnable: state.tokenCounts.runnable ?? this.calculateScopeTokens('runnable'),
      };
    } else {
      this.recalculateAllTokens();
    }

    this.logger.info('Memory state imported', this.getStats());
  }

  /**
   * Estimate token count for a string (rough: 4 chars = 1 token).
   */
  private estimateTokens(content: string): number {
    return Math.ceil(content.length / 4);
  }

  /**
   * Calculate token count for a specific scope.
   */
  private calculateScopeTokens(scope: MemoryScope): number {
    const messages = this.getMessagesByScope(scope);
    return messages.reduce((sum, m) => sum + this.estimateTokens(m.content), 0);
  }

  /**
   * Recalculate all token counts.
   */
  private recalculateAllTokens(): void {
    this.memory.tokenCounts = {
      session: this.calculateScopeTokens('session'),
      entry: this.calculateScopeTokens('entry'),
      runnable: this.calculateScopeTokens('runnable'),
    };
  }
}

/**
 * Create a new hierarchical memory manager instance.
 */
export function createMemoryManager(logger: Logger, maxTokens?: number): WorkingMemoryManager {
  return new WorkingMemoryManager(logger, maxTokens);
}
