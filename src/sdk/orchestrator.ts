/**
 * Confucius SDK - Orchestrator
 * 
 * The core agent loop that repeatedly invokes the LLM, interprets outputs,
 * and coordinates tool use through extensions.
 * 
 * Implements Algorithm 1 from the Confucius Code Agent paper.
 * 
 * @see https://arxiv.org/abs/2512.10398v5 Section 2.2
 */

import type {
  RunContext,
  RunConfig,
  WorkingMemory,
  Message,
  OrchestratorState,
  LLMResponse,
  ExecutionResult,
  Logger,
  ArtifactStore,
  Note,
} from './types.js';
import { ExtensionRegistry } from './registry.js';

/**
 * LLMProvider - Interface for language model invocation.
 * 
 * Implementations can wrap Anthropic, OpenAI, or local models.
 */
export interface LLMProvider {
  invoke(
    systemPrompt: string,
    messages: Message[]
  ): Promise<LLMResponse>;
}

/**
 * OrchestratorOptions - Configuration for the orchestrator.
 */
export interface OrchestratorOptions {
  /** Language model provider */
  llm: LLMProvider;
  
  /** Extension registry */
  registry: ExtensionRegistry;
  
  /** Logger for observability */
  logger: Logger;
  
  /** Artifact storage */
  artifacts: ArtifactStore;
  
  /** System prompt template */
  systemPrompt: string;
  
  /** Run configuration */
  config: RunConfig;
}

/**
 * ConfuciusOrchestrator - The main agent execution loop.
 * 
 * Algorithm 1 from the paper:
 * ```
 * 1: Initialize session context, memory, extensions
 * 2: while iteration < max_iters do
 * 3:   Invoke LLM with system prompt + memory
 * 4:   Parse LLM output into actions
 * 5:   for all actions a do
 * 6:     Route a to its extension
 * 7:     Execute extension; update memory
 * 8:     if extension signals continuation then
 * 9:       continue
 * 10:    end if
 * 11:  end for
 * 12:  add observations (results, error, etc.) to memory
 * 13:  Check for completion; break if done
 * 14: end while
 * 15: return final output and artifacts
 * ```
 */
export class ConfuciusOrchestrator {
  private llm: LLMProvider;
  private registry: ExtensionRegistry;
  private logger: Logger;
  private artifacts: ArtifactStore;
  private systemPrompt: string;
  private config: RunConfig;

  constructor(options: OrchestratorOptions) {
    this.llm = options.llm;
    this.registry = options.registry;
    this.logger = options.logger;
    this.artifacts = options.artifacts;
    this.systemPrompt = options.systemPrompt;
    this.config = options.config;
  }

  /**
   * Run the orchestrator loop on a task.
   * 
   * @param initialMessage - The user's task/request
   * @returns Final state with results
   */
  async run(initialMessage: string): Promise<OrchestratorState> {
    const sessionId = this.generateSessionId();
    const timer = this.logger.startTimer('orchestrator:run');

    this.logger.info('Starting orchestrator run', {
      sessionId,
      maxIterations: this.config.maxIterations,
      enabledExtensions: this.config.enabledExtensions,
    });

    // Step 1: Initialize session context, memory, extensions
    const memory = this.initializeMemory();
    const context = this.createContext(sessionId, memory);

    // Add initial user message
    memory.messages.push({
      role: 'user',
      content: initialMessage,
      timestamp: new Date(),
      scope: 'session',
    });

    const state: OrchestratorState = {
      iteration: 0,
      running: true,
    };

    try {
      // Step 2: Main loop
      while (state.iteration < this.config.maxIterations && state.running) {
        state.iteration++;
        context.iteration = state.iteration;

        this.logger.info(`Iteration ${state.iteration}`, {
          messageCount: memory.messages.length,
          tokenCount: memory.tokenCount,
        });

        // Check for context compression need
        if (memory.tokenCount > this.config.compressionThreshold) {
          await this.compressContext(memory, context);
        }

        // Apply input callbacks from extensions
        const processedMessages = this.registry.applyInputCallbacks(
          memory.messages,
          context
        );

        // Step 3: Invoke LLM with system prompt + memory
        const llmResponse = await this.invokeLLM(processedMessages);

        // Update token count
        memory.tokenCount += llmResponse.usage.totalTokens;

        // Apply output callbacks from extensions
        const processedOutput = this.registry.applyOutputCallbacks(
          llmResponse.content,
          context
        );

        // Step 4: Parse LLM output into actions
        const actions = this.registry.parseOutput(processedOutput);

        this.logger.debug('Parsed actions', {
          count: actions.length,
          tools: actions.map(a => a.extension.name),
        });

        // Check for completion (no actions emitted)
        if (actions.length === 0) {
          this.logger.info('No actions parsed - agent completed');
          state.running = false;
          state.terminationReason = 'completed';
          
          // Add assistant's final message to memory
          memory.messages.push({
            role: 'assistant',
            content: processedOutput,
            timestamp: new Date(),
            scope: 'session',
          });
          
          state.result = {
            success: true,
            output: processedOutput,
          };
          break;
        }

        // Add assistant message with actions
        memory.messages.push({
          role: 'assistant',
          content: processedOutput,
          timestamp: new Date(),
          scope: 'entry',
        });

        // Steps 5-11: Execute actions
        let shouldContinue = false;
        const results: ExecutionResult[] = [];

        for (const { extension, action } of actions) {
          // Step 6-7: Route and execute
          const result = await this.registry.execute(extension, action, context);
          results.push(result);

          // Step 12: Add observations to memory
          memory.messages.push({
            role: 'tool',
            content: `<result>${result.output}</result>`,
            toolName: extension.name,
            timestamp: new Date(),
            scope: 'runnable',
          });

          // Step 8-10: Check continuation signal
          if (extension.signalsContinuation !== false) {
            shouldContinue = true;
          }

          // Handle artifacts
          if (result.artifacts) {
            for (const artifact of result.artifacts) {
              await this.artifacts.save(artifact);
            }
          }
        }

        // If no extension signaled continuation and all succeeded, check completion
        if (!shouldContinue) {
          const allSucceeded = results.every(r => r.success);
          if (allSucceeded) {
            this.logger.info('All actions completed without continuation signal');
            // Continue to let agent decide if more work needed
          }
        }
      }

      // Check if we hit max iterations
      if (state.iteration >= this.config.maxIterations && state.running) {
        state.running = false;
        state.terminationReason = 'max_iterations';
        this.logger.warn('Hit maximum iterations', {
          maxIterations: this.config.maxIterations,
        });
      }

    } catch (error) {
      state.running = false;
      state.terminationReason = 'error';
      state.result = {
        success: false,
        output: `Orchestrator error: ${error instanceof Error ? error.message : String(error)}`,
        error: {
          code: 'ORCHESTRATOR_ERROR',
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          recoverable: false,
        },
      };
      this.logger.error('Orchestrator error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    } finally {
      timer();
    }

    // Step 15: Return final output and artifacts
    this.logger.info('Orchestrator run complete', {
      sessionId,
      iterations: state.iteration,
      terminationReason: state.terminationReason,
      success: state.result?.success,
    });

    return state;
  }

  /**
   * Initialize empty working memory.
   */
  private initializeMemory(): WorkingMemory {
    return {
      messages: [],
      tokenCount: 0,
      maxTokens: this.config.compressionThreshold * 1.5,
      notes: new Map(),
    };
  }

  /**
   * Create runtime context for extensions.
   */
  private createContext(sessionId: string, memory: WorkingMemory): RunContext {
    return {
      sessionId,
      iteration: 0,
      maxIterations: this.config.maxIterations,
      memory,
      artifacts: this.artifacts,
      logger: this.logger,
      config: this.config,

      addMessage: (message: Message): void => {
        memory.messages.push(message);
      },

      readNote: (path: string): Note | null => {
        return memory.notes.get(path) ?? null;
      },

      writeNote: (note: Note): void => {
        memory.notes.set(note.path, note);
      },

      searchNotes: (query: string): Note[] => {
        const results: Note[] = [];
        const queryLower = query.toLowerCase();
        
        for (const note of memory.notes.values()) {
          if (
            note.content.toLowerCase().includes(queryLower) ||
            note.tags.some(t => t.toLowerCase().includes(queryLower))
          ) {
            results.push(note);
          }
        }
        
        return results;
      },
    };
  }

  /**
   * Invoke the LLM with current memory state.
   */
  private async invokeLLM(messages: Message[]): Promise<LLMResponse> {
    const timer = this.logger.startTimer('llm:invoke');
    
    try {
      // Build full system prompt with tool documentation
      const fullSystemPrompt = [
        this.systemPrompt,
        '',
        this.registry.generateToolDocs(),
      ].join('\n');

      const response = await this.llm.invoke(fullSystemPrompt, messages);
      
      this.logger.debug('LLM response received', {
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        stopReason: response.stopReason,
      });

      return response;
    } finally {
      timer();
    }
  }

  /**
   * Compress context when approaching token limits.
   * 
   * This is a placeholder for the Architect agent (Phase 3).
   * Currently implements simple truncation.
   */
  private async compressContext(
    memory: WorkingMemory,
    _context: RunContext
  ): Promise<void> {
    this.logger.info('Compressing context', {
      currentTokens: memory.tokenCount,
      threshold: this.config.compressionThreshold,
    });

    // TODO: Phase 3 - Implement Architect agent for intelligent summarization
    // For now, simple strategy: keep system + recent N messages
    // Placeholder await for future LLM integration
    await Promise.resolve();
    const keepRecent = 10;
    
    if (memory.messages.length > keepRecent) {
      const removed = memory.messages.splice(0, memory.messages.length - keepRecent);
      
      // Create a summary message
      const summary: Message = {
        role: 'system',
        content: `[Context compressed: ${removed.length} earlier messages summarized]`,
        timestamp: new Date(),
        scope: 'session',
      };
      
      memory.messages.unshift(summary);
      
      // Rough token estimate (will be more accurate in Phase 3)
      memory.tokenCount = Math.floor(memory.tokenCount * 0.6);
      
      this.logger.info('Context compressed', {
        removedMessages: removed.length,
        newTokenEstimate: memory.tokenCount,
      });
    }
  }

  /**
   * Generate a unique session ID.
   */
  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `session_${timestamp}_${random}`;
  }
}

/**
 * Create a new orchestrator instance.
 */
export function createOrchestrator(options: OrchestratorOptions): ConfuciusOrchestrator {
  return new ConfuciusOrchestrator(options);
}
