/**
 * Confucius SDK - Working Memory Manager
 * 
 * Manages hierarchical working memory with visibility scopes.
 * 
 * Phase 2 implementation - basic version for now.
 * 
 * @see https://arxiv.org/abs/2512.10398v5 Section 2.3.1
 */

import type { WorkingMemory, Message, Note, MemoryScope, Logger } from '../types.js';

/**
 * WorkingMemoryManager - Manages the agent's context window.
 */
export class WorkingMemoryManager {
  private memory: WorkingMemory;
  private logger: Logger;

  constructor(logger: Logger, maxTokens: number = 100000) {
    this.logger = logger;
    this.memory = {
      messages: [],
      tokenCount: 0,
      maxTokens,
      notes: new Map(),
    };
  }

  /**
   * Get the current memory state.
   */
  getMemory(): WorkingMemory {
    return this.memory;
  }

  /**
   * Add a message to memory.
   */
  addMessage(message: Message): void {
    this.memory.messages.push({
      ...message,
      timestamp: message.timestamp || new Date(),
      scope: message.scope || 'entry',
    });

    // Rough token estimate (4 chars per token)
    const tokens = Math.ceil(message.content.length / 4);
    this.memory.tokenCount += tokens;

    this.logger.debug('Message added to memory', {
      role: message.role,
      scope: message.scope,
      tokens,
      totalTokens: this.memory.tokenCount,
    });
  }

  /**
   * Get messages filtered by scope.
   */
  getMessagesByScope(scope: MemoryScope): Message[] {
    return this.memory.messages.filter(m => m.scope === scope);
  }

  /**
   * Clear messages with a specific scope.
   */
  clearScope(scope: MemoryScope): void {
    const before = this.memory.messages.length;
    this.memory.messages = this.memory.messages.filter(m => m.scope !== scope);
    const cleared = before - this.memory.messages.length;

    if (cleared > 0) {
      this.logger.info(`Cleared ${cleared} messages from scope: ${scope}`);
      // Recalculate token count
      this.recalculateTokens();
    }
  }

  /**
   * Clear runnable-scoped messages (after tool execution).
   */
  clearRunnable(): void {
    this.clearScope('runnable');
  }

  /**
   * Check if compression is needed.
   */
  needsCompression(threshold: number): boolean {
    return this.memory.tokenCount > threshold;
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
   * Export memory state for persistence.
   */
  export(): {
    messages: Message[];
    notes: Array<[string, Note]>;
    tokenCount: number;
  } {
    return {
      messages: [...this.memory.messages],
      notes: Array.from(this.memory.notes.entries()),
      tokenCount: this.memory.tokenCount,
    };
  }

  /**
   * Import memory state.
   */
  import(state: {
    messages: Message[];
    notes: Array<[string, Note]>;
    tokenCount?: number;
  }): void {
    this.memory.messages = [...state.messages];
    this.memory.notes = new Map(state.notes);
    
    if (state.tokenCount !== undefined) {
      this.memory.tokenCount = state.tokenCount;
    } else {
      this.recalculateTokens();
    }

    this.logger.info('Memory state imported', {
      messages: this.memory.messages.length,
      notes: this.memory.notes.size,
      tokens: this.memory.tokenCount,
    });
  }

  /**
   * Recalculate token count from messages.
   */
  private recalculateTokens(): void {
    this.memory.tokenCount = this.memory.messages.reduce(
      (sum, m) => sum + Math.ceil(m.content.length / 4),
      0
    );
  }
}

/**
 * Create a new memory manager instance.
 */
export function createMemoryManager(logger: Logger, maxTokens?: number): WorkingMemoryManager {
  return new WorkingMemoryManager(logger, maxTokens);
}
