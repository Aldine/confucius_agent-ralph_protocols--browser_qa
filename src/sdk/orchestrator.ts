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
import { WorkingMemoryManager } from './memory/working-memory.js';
import { ArchitectAgent, type ArchitectLLM } from './agents/architect.js';
import { NoteTakerAgent, type NoteTakerLLM } from './agents/note-taker.js';
import { MetaAgent, type MetaAgentLLM } from './agents/meta-agent.js';
import { KnowledgeBase } from './memory/knowledge-base.js';
import * as fs from 'fs/promises';
import * as path from 'path';

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
  
  /** Working directory for session logs */
  workingDirectory?: string;
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
  private architect: ArchitectAgent;
  private noteTaker: NoteTakerAgent;
  private metaAgent: MetaAgent;
  private knowledgeBase: KnowledgeBase;
  private workingDirectory: string;

  constructor(options: OrchestratorOptions) {
    this.llm = options.llm;
    this.registry = options.registry;
    this.logger = options.logger;
    this.artifacts = options.artifacts;
    this.systemPrompt = options.systemPrompt;
    this.config = options.config;
    this.workingDirectory = options.workingDirectory || process.cwd();
    
    // Create LLM adapter for sub-agents
    const agentLLM: ArchitectLLM & NoteTakerLLM & MetaAgentLLM = {
      chat: async (systemPrompt: string, userMessage: string) => {
        const response = await this.llm.invoke(systemPrompt, [
          { role: 'user', content: userMessage }
        ]);
        return response.content;
      }
    };
    
    // Initialize sub-agents
    this.architect = new ArchitectAgent(this.logger, agentLLM);
    this.noteTaker = new NoteTakerAgent(this.logger, agentLLM);
    this.metaAgent = new MetaAgent(this.logger, agentLLM);
    
    // Initialize knowledge base
    this.knowledgeBase = new KnowledgeBase(this.logger, this.workingDirectory);
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

    // Step 0: Load learned rules from Knowledge Base
    const learnedRules = await this.knowledgeBase.loadRules();
    let enhancedSystemPrompt = this.systemPrompt;
    
    if (learnedRules.trim().length > 0) {
      this.logger.info('[Meta-Agent] Injecting learned rules into system prompt');
      enhancedSystemPrompt = `${this.systemPrompt}

## Learned Rules (from previous sessions)
${learnedRules}

Apply these rules when relevant to the current task.`;
    }

    // Step 1: Initialize hierarchical memory with three scopes
    const memoryManager = new WorkingMemoryManager(this.logger, this.config.compressionThreshold * 1.5);
    
    // Session Scope: System prompt with learned rules (immutable)
    memoryManager.initializeSession(enhancedSystemPrompt);
    
    // Entry Scope: User's task (persistent across retries)
    memoryManager.setEntry(initialMessage);
    
    // Get legacy memory interface for compatibility
    const memory = memoryManager.getMemory();
    const context = this.createContext(sessionId, memory, memoryManager);

    const state: OrchestratorState = {
      iteration: 0,
      running: true,
    };

    try {
      // Step 2: Main loop
      while (state.iteration < this.config.maxIterations && state.running) {
        state.iteration++;
        context.iteration = state.iteration;

        // Log memory stats
        const stats = memoryManager.getStats();
        this.logger.info(`Iteration ${state.iteration}`, {
          sessionTokens: stats.scopes.session.tokens,
          entryTokens: stats.scopes.entry.tokens,
          runnableTokens: stats.scopes.runnable.tokens,
          totalTokens: stats.total.tokens,
        });

        // Check for context compression need (based on runnable scope)
        if (memoryManager.needsCompression(this.config.compressionThreshold)) {
          await this.compressContext(memoryManager, context);
        }

        // Apply input callbacks from extensions (use hierarchical messages)
        const processedMessages = this.registry.applyInputCallbacks(
          memoryManager.getMessages(),
          context
        );

        // Step 3: Invoke LLM with system prompt + memory
        const llmResponse = await this.invokeLLM(processedMessages);

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
          
          // Add assistant's final message to runnable scope
          memoryManager.addToRunnable({
            role: 'assistant',
            content: processedOutput,
            timestamp: new Date(),
          });
          
          state.result = {
            success: true,
            output: processedOutput,
          };
          break;
        }

        // Add assistant message with actions to runnable scope
        memoryManager.addToRunnable({
          role: 'assistant',
          content: processedOutput,
          timestamp: new Date(),
        });

        // Steps 5-11: Execute actions
        let shouldContinue = false;
        let shouldTerminate = false;
        let terminationMessage = '';
        const results: ExecutionResult[] = [];

        for (const { extension, action } of actions) {
          // Step 6-7: Route and execute
          const result = await this.registry.execute(extension, action, context);
          results.push(result);

          // Check for termination signal from extension (e.g., finish extension)
          if (result.metadata?.terminate) {
            shouldTerminate = true;
            terminationMessage = result.metadata.finalMessage as string || result.output;
            this.logger.info('Termination signal received', {
              extension: extension.name,
              reason: result.metadata.reason,
            });
          }

          // Step 12: Add observations to runnable scope
          memoryManager.addToRunnable({
            role: 'tool',
            content: `<result>${result.output}</result>`,
            toolName: extension.name,
            timestamp: new Date(),
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

          // If termination was signaled, stop executing more actions
          if (shouldTerminate) {
            break;
          }
        }

        // Handle termination signal
        if (shouldTerminate) {
          state.running = false;
          state.terminationReason = 'completed';
          state.result = {
            success: true,
            output: terminationMessage,
          };
          this.logger.info('Agent completed task', { message: terminationMessage });
          break;
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

    // Step 15: Generate session summary with NoteTaker
    let sessionSummary = '';
    try {
      const allMessages = memoryManager.getMessages();
      const finalResult: ExecutionResult = state.result || {
        success: false,
        output: 'No result available',
      };
      
      sessionSummary = await this.noteTaker.generateSessionSummary(allMessages, finalResult);
      await this.writeSessionSummary(sessionId, sessionSummary);
    } catch (summaryError) {
      this.logger.error('Failed to generate session summary', {
        error: summaryError instanceof Error ? summaryError.message : String(summaryError),
      });
    }

    // Step 16: Meta-Agent extracts lesson and updates Knowledge Base
    if (sessionSummary.length > 0) {
      try {
        const lesson = await this.metaAgent.extractLesson(sessionSummary);
        if (lesson && lesson.trim().length > 0) {
          await this.knowledgeBase.addRule(lesson);
          this.logger.info(`[Meta-Agent] Learned new rule: ${lesson}`);
        }
      } catch (metaError) {
        this.logger.error('Failed to extract lesson', {
          error: metaError instanceof Error ? metaError.message : String(metaError),
        });
      }
    }

    // Step 17: Return final output and artifacts
    this.logger.info('Orchestrator run complete', {
      sessionId,
      iterations: state.iteration,
      terminationReason: state.terminationReason,
      success: state.result?.success,
    });

    return state;
  }

  /**
   * Write session summary to .ralph/sessions/ directory.
   */
  private async writeSessionSummary(sessionId: string, summary: string): Promise<void> {
    const sessionsDir = path.join(this.workingDirectory, '.ralph', 'sessions');
    
    // Ensure directory exists
    await fs.mkdir(sessionsDir, { recursive: true });
    
    // Create timestamp-based filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `session-${timestamp}.md`;
    const filepath = path.join(sessionsDir, filename);
    
    await fs.writeFile(filepath, summary, 'utf-8');
    
    this.logger.info('Session summary written', {
      path: filepath,
      sessionId,
    });
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
  private createContext(sessionId: string, memory: WorkingMemory, memoryManager?: WorkingMemoryManager): RunContext {
    return {
      sessionId,
      iteration: 0,
      maxIterations: this.config.maxIterations,
      memory,
      artifacts: this.artifacts,
      logger: this.logger,
      config: this.config,

      addMessage: (message: Message): void => {
        if (memoryManager) {
          memoryManager.addMessage(message);
        } else {
          memory.messages.push(message);
        }
      },

      readNote: (path: string): Note | null => {
        if (memoryManager) {
          return memoryManager.getNote(path) ?? null;
        }
        return memory.notes.get(path) ?? null;
      },

      writeNote: (note: Note): void => {
        if (memoryManager) {
          memoryManager.setNote(note);
        } else {
          memory.notes.set(note.path, note);
        }
      },

      searchNotes: (query: string): Note[] => {
        if (memoryManager) {
          return memoryManager.searchNotes(query);
        }
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
   * Uses the Architect agent to intelligently summarize the runnable scope
   * while preserving session and entry scopes intact.
   */
  private async compressContext(
    memoryManager: WorkingMemoryManager,
    _context: RunContext
  ): Promise<void> {
    const stats = memoryManager.getStats();
    this.logger.info('Compressing context', {
      sessionTokens: stats.scopes.session.tokens,
      entryTokens: stats.scopes.entry.tokens,
      runnableTokens: stats.scopes.runnable.tokens,
      threshold: this.config.compressionThreshold,
    });

    // Get runnable messages for summarization
    const runnableMessages = memoryManager.getRunnableMessages();
    
    if (runnableMessages.length <= 2) {
      this.logger.info('Too few runnable messages to compress, skipping');
      return;
    }

    // Keep recent messages, summarize older ones
    const keepRecent = 4;
    const toSummarize = runnableMessages.slice(0, -keepRecent);
    const toKeep = runnableMessages.slice(-keepRecent);

    if (toSummarize.length === 0) {
      this.logger.info('Nothing to summarize, skipping compression');
      return;
    }

    // Use Architect to summarize the older messages
    const summary = await this.architect.summarize(toSummarize);

    // Replace runnable scope with summary + recent messages
    const summaryMessage: Message = {
      role: 'system',
      content: `[PREVIOUS CONTEXT SUMMARY]:\n${summary}`,
      timestamp: new Date(),
      scope: 'runnable',
    };

    memoryManager.compressRunnable([summaryMessage, ...toKeep]);

    const newStats = memoryManager.getStats();
    this.logger.info('Context compressed via Architect', {
      summarizedMessages: toSummarize.length,
      keptMessages: toKeep.length + 1,
      oldRunnableTokens: stats.scopes.runnable.tokens,
      newRunnableTokens: newStats.scopes.runnable.tokens,
      tokensSaved: stats.scopes.runnable.tokens - newStats.scopes.runnable.tokens,
    });
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
