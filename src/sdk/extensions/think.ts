/**
 * Think Extension - Internal reasoning/scratchpad
 * 
 * Allows the agent to "think out loud" without taking action.
 * Used for planning, analysis, and structured reasoning.
 * 
 * This is a "reasoning extension" per Section 2.3.3 of the paper.
 * 
 * @example
 * LLM output: <think>Let me analyze the error message...</think>
 */

import type { IExtension, ParsedAction, ExecutionResult, RunContext } from '../types.js';

/**
 * ThinkExtension - Internal reasoning for the agent.
 * 
 * Unlike tool extensions, this does NOT signal continuation by default.
 * The agent's thinking is logged but doesn't interrupt the flow.
 */
export class ThinkExtension implements IExtension {
  readonly name = 'think';
  readonly description = 'Internal reasoning and planning. Use to think through problems before acting. Does not produce external output.';
  readonly triggerTag = 'think';
  readonly signalsContinuation = false; // Thinking doesn't need follow-up

  /**
   * Parse thinking content.
   */
  parse(content: string): ParsedAction | null {
    return {
      tool: 'think',
      parameters: { thought: content.trim() },
      rawContent: content,
    };
  }

  /**
   * "Execute" the thinking - just log it for observability.
   */
  async execute(action: ParsedAction, context: RunContext): Promise<ExecutionResult> {
    const thought = action.parameters.thought as string;

    // Log for DX observability
    context.logger.debug('Agent thinking', {
      thoughtPreview: thought.substring(0, 200),
      length: thought.length,
    });

    // Placeholder await for future async operations
    await Promise.resolve();

    // For AX: Minimal acknowledgment (or could return empty)
    // For UX: Could display in a "thinking" UI panel
    return {
      success: true,
      output: '', // Empty - don't pollute working memory
      userOutput: `💭 ${thought}`, // Rich display for users
    };
  }
}

/**
 * Create a new Think extension instance.
 */
export function createThinkExtension(): ThinkExtension {
  return new ThinkExtension();
}
