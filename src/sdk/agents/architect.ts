/**
 * Confucius SDK - Architect Agent
 * 
 * The Architect agent summarizes conversation history when
 * the context window approaches its limits.
 * 
 * Implements the context compression strategy from the Confucius paper.
 * 
 * @see https://arxiv.org/abs/2512.10398v5 Section 2.3.1 (Context Management)
 */

import type { Message, Logger } from '../types.js';

/**
 * LLM interface for the Architect (simplified).
 */
export interface ArchitectLLM {
  chat(systemPrompt: string, userMessage: string): Promise<string>;
}

/**
 * ArchitectAgent - Context compression via intelligent summarization.
 * 
 * When invoked, the Architect:
 * 1. Analyzes the execution trace (runnable scope)
 * 2. Identifies key information: goals, decisions, tool outputs, errors
 * 3. Produces a concise structured summary
 * 4. Preserves recent messages for continuity
 */
export class ArchitectAgent {
  private logger: Logger;
  private llm?: ArchitectLLM;

  constructor(logger: Logger, llm?: ArchitectLLM) {
    this.logger = logger;
    this.llm = llm;
  }

  /**
   * Set the LLM client (can be set after construction).
   */
  setLLM(llm: ArchitectLLM): void {
    this.llm = llm;
  }

  /**
   * Summarize an execution trace using the LLM.
   * 
   * @param messages - Messages to summarize (typically runnable scope)
   * @returns A concise summary string
   */
  async summarize(messages: Message[]): Promise<string> {
    this.logger.info('[Architect] Compressing context...', {
      inputMessages: messages.length,
    });

    if (!this.llm) {
      this.logger.warn('[Architect] No LLM configured, using fallback summary');
      return this.createFallbackSummary(messages);
    }

    const systemPrompt = `You are the Architect, a context compression specialist.

Your task is to summarize technical execution traces concisely while preserving critical information.

PRESERVE:
- Key decisions made by the agent
- Tool invocation results (success/failure, important outputs)
- Current state of the task
- Any errors encountered and how they were handled
- What still needs to be done

DISCARD:
- Verbose logs and debug output
- Redundant information
- Intermediate reasoning that led nowhere

OUTPUT FORMAT:
Provide a structured summary in 3-5 bullet points. Be concise but complete.`;

    const traceContent = this.formatTraceForSummary(messages);
    
    const userMessage = `Summarize this execution trace:

${traceContent}

Provide a concise summary preserving key information.`;

    try {
      const summary = await this.llm.chat(systemPrompt, userMessage);
      
      this.logger.info('[Architect] Context compressed successfully', {
        originalMessages: messages.length,
        summaryLength: summary.length,
      });

      return summary;
    } catch (error) {
      this.logger.error('[Architect] LLM summarization failed, using fallback');
      return this.createFallbackSummary(messages);
    }
  }

  /**
   * Compress the conversation history (legacy method for compatibility).
   * 
   * @param messages - Full message history
   * @param recentWindowSize - Number of recent messages to keep verbatim
   * @returns Compressed messages
   */
  async compress(
    messages: Message[],
    recentWindowSize: number = 10
  ): Promise<Message[]> {
    this.logger.info('[Architect] Compressing context', {
      inputMessages: messages.length,
      recentWindow: recentWindowSize,
    });

    if (messages.length <= recentWindowSize) {
      return messages;
    }

    const older = messages.slice(0, -recentWindowSize);
    const recent = messages.slice(-recentWindowSize);

    // Summarize older messages
    const summary = await this.summarize(older);

    const summaryMessage: Message = {
      role: 'system',
      content: `[PREVIOUS CONTEXT SUMMARY]:\n${summary}`,
      timestamp: new Date(),
      scope: 'runnable',
    };

    this.logger.info('[Architect] Context compressed', {
      summarizedMessages: older.length,
      keptRecent: recent.length,
    });

    return [summaryMessage, ...recent];
  }

  /**
   * Format messages into a readable trace for the LLM.
   */
  private formatTraceForSummary(messages: Message[]): string {
    return messages.map((m, i) => {
      const role = m.role.toUpperCase();
      const tool = m.toolName ? ` [${m.toolName}]` : '';
      const content = m.content.length > 500 
        ? m.content.substring(0, 500) + '...[truncated]'
        : m.content;
      return `[${i + 1}] ${role}${tool}: ${content}`;
    }).join('\n\n');
  }

  /**
   * Create a fallback summary when LLM is not available.
   */
  private createFallbackSummary(messages: Message[]): string {
    const userMessages = messages.filter(m => m.role === 'user');
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    const toolMessages = messages.filter(m => m.role === 'tool');

    // Extract tool names used
    const toolsUsed = [...new Set(toolMessages.map(m => m.toolName).filter(Boolean))];

    // Try to find success/failure indicators
    const successCount = toolMessages.filter(m => 
      m.content.includes('success') || m.content.includes('completed')
    ).length;
    const errorCount = toolMessages.filter(m => 
      m.content.includes('error') || m.content.includes('failed')
    ).length;

    return `• Executed ${messages.length} steps in this trace
• Tools used: ${toolsUsed.join(', ') || 'none'}
• ${successCount} successful operations, ${errorCount} errors
• ${userMessages.length} user interactions, ${assistantMessages.length} agent responses
• Note: This is an automated summary. Recent context preserved below.`;
  }
}

/**
 * Create a new Architect agent instance.
 */
export function createArchitectAgent(logger: Logger, llm?: ArchitectLLM): ArchitectAgent {
  return new ArchitectAgent(logger, llm);
}
