/**
 * Confucius SDK - Meta-Agent
 * 
 * The Meta-Agent reviews session summaries and extracts actionable
 * lessons to improve future agent performance.
 * 
 * Part of the Self-Improvement Loop from the Confucius paper.
 * 
 * @see https://arxiv.org/abs/2512.10398v5 Section 2.3.3 (Self-Improvement Loop)
 */

import type { Logger } from '../types.js';

/**
 * LLM interface for the MetaAgent.
 */
export interface MetaAgentLLM {
  chat(systemPrompt: string, userMessage: string): Promise<string>;
}

/**
 * MetaAgent - Learns from session summaries.
 * 
 * After each session, the Meta-Agent:
 * 1. Reviews the session summary from NoteTaker
 * 2. Identifies patterns, errors, and inefficiencies
 * 3. Extracts ONE actionable rule or best practice
 * 4. The rule is stored in the Knowledge Base for future runs
 */
export class MetaAgent {
  private logger: Logger;
  private llm?: MetaAgentLLM;

  constructor(logger: Logger, llm?: MetaAgentLLM) {
    this.logger = logger;
    this.llm = llm;
  }

  /**
   * Set the LLM client (can be set after construction).
   */
  setLLM(llm: MetaAgentLLM): void {
    this.llm = llm;
  }

  /**
   * Extract a lesson from a session summary.
   * 
   * @param sessionSummary - The Markdown summary from NoteTaker
   * @returns A single actionable rule or best practice
   */
  async extractLesson(sessionSummary: string): Promise<string> {
    this.logger.info('[Meta-Agent] Extracting lesson from session...');

    if (!this.llm) {
      this.logger.warn('[Meta-Agent] No LLM configured, using fallback extraction');
      return this.createFallbackLesson(sessionSummary);
    }

    const systemPrompt = `You are the Meta-Agent. Your role is to analyze session summaries and extract lessons that will improve future agent performance.

Review the session summary provided. Identify ONE actionable rule or best practice that would:
- Prevent errors encountered in this session
- Improve efficiency or reliability
- Help the agent handle similar tasks better

Output ONLY the rule itself. Do not include any explanation, preamble, or formatting.
The rule should be:
- Specific and actionable
- Written as an instruction (e.g., "Always verify file existence before reading")
- Concise (one or two sentences max)`;

    const userMessage = `Session Summary:\n\n${sessionSummary}\n\nExtract ONE actionable rule from this session.`;

    try {
      const lesson = await this.llm.chat(systemPrompt, userMessage);
      
      // Clean up the response (remove quotes, extra whitespace, etc.)
      const cleanedLesson = lesson
        .trim()
        .replace(/^["']|["']$/g, '') // Remove surrounding quotes
        .replace(/^-\s*/, '') // Remove leading dash
        .replace(/^\d+\.\s*/, ''); // Remove leading number
      
      this.logger.info('[Meta-Agent] Learned new rule', {
        rule: cleanedLesson.substring(0, 100),
      });

      return cleanedLesson;
    } catch (error) {
      this.logger.error('[Meta-Agent] Failed to extract lesson', {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.createFallbackLesson(sessionSummary);
    }
  }

  /**
   * Create a fallback lesson when LLM is not available.
   */
  private createFallbackLesson(sessionSummary: string): string {
    // Extract basic patterns from the summary
    if (sessionSummary.includes('Error') || sessionSummary.includes('error')) {
      if (sessionSummary.includes('file')) {
        return 'Always verify file operations completed successfully before proceeding.';
      }
      if (sessionSummary.includes('command') || sessionSummary.includes('bash')) {
        return 'Check command exit codes and handle shell compatibility issues across platforms.';
      }
      return 'Implement error handling and recovery strategies for failed operations.';
    }

    if (sessionSummary.includes('Success') || sessionSummary.includes('success')) {
      return 'Verify task completion with explicit confirmation before finishing.';
    }

    return 'Break complex tasks into smaller, verifiable steps.';
  }
}

/**
 * Create a new Meta-Agent instance.
 */
export function createMetaAgent(logger: Logger, llm?: MetaAgentLLM): MetaAgent {
  return new MetaAgent(logger, llm);
}
