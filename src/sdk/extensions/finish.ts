/**
 * Finish Extension - Signal task completion
 * 
 * Allows the agent to signal that it has completed the task.
 * When executed, this extension tells the Orchestrator to stop the loop.
 * 
 * @example
 * LLM output: <finish>Task completed successfully. Created proof.txt with the requested content.</finish>
 */

import type { IExtension, ParsedAction, ExecutionResult, RunContext } from '../types.js';

/**
 * FinishExtension - Signals task completion to the orchestrator.
 */
export class FinishExtension implements IExtension {
  readonly name = 'finish';
  readonly description = 'Signal that the task is complete. Use when all requested work is done. The content becomes the final result message.';
  readonly triggerTag = 'finish';
  
  /**
   * This extension does NOT signal continuation - it terminates the loop.
   */
  readonly signalsContinuation = false;

  /**
   * Parse finish message from LLM output.
   */
  parse(content: string): ParsedAction | null {
    // The content is the completion message
    const message = content.trim();
    
    if (!message) {
      return null;
    }

    return {
      tool: 'finish',
      parameters: {
        message,
      },
      rawContent: content,
    };
  }

  /**
   * Execute the finish signal.
   * Returns success with the completion message and signals termination.
   */
  async execute(action: ParsedAction, context: RunContext): Promise<ExecutionResult> {
    const { message } = action.parameters as { message: string };

    return {
      success: true,
      output: message,
      // Special flag to signal the orchestrator to terminate
      metadata: {
        terminate: true,
        reason: 'completed',
        finalMessage: message,
      },
    };
  }
}

/**
 * Factory function to create a FinishExtension instance.
 */
export function createFinishExtension(): FinishExtension {
  return new FinishExtension();
}
