#!/usr/bin/env node
import { Command } from 'commander';
import dotenv from 'dotenv';
import { LLMClient } from './core/llm.js';
import { ConfuciusOrchestrator, LLMProvider } from './sdk/orchestrator.js';
import { ExtensionRegistry } from './sdk/registry.js';
import { createBashExtension, createFileEditExtension, createThinkExtension, createFinishExtension } from './sdk/extensions/index.js';
import { logger } from './core/logger.js';
import type { Message, LLMResponse, Logger, ArtifactStore, Artifact, RunConfig } from './sdk/types.js';

dotenv.config();
const program = new Command();

/**
 * Adapter to bridge simple LLMClient to LLMProvider interface.
 */
class LLMClientAdapter implements LLMProvider {
  constructor(private client: LLMClient) {}

  async invoke(systemPrompt: string, messages: Message[]): Promise<LLMResponse> {
    const userMessage = messages.filter(m => m.role === 'user').pop()?.content || '';
    const content = await this.client.chat(systemPrompt, userMessage);
    return {
      content,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      stopReason: 'end_turn',
    };
  }
}

/**
 * Simple in-memory artifact store.
 */
class MemoryArtifactStore implements ArtifactStore {
  private artifacts: Map<string, Artifact> = new Map();

  async save(artifact: Artifact): Promise<string> {
    this.artifacts.set(artifact.id, artifact);
    return artifact.id;
  }

  async get(id: string): Promise<Artifact | null> {
    return this.artifacts.get(id) || null;
  }

  async list(): Promise<Artifact[]> {
    return Array.from(this.artifacts.values());
  }
}

/**
 * Adapter to bridge simple Logger to SDK Logger interface.
 */
const sdkLogger: Logger = {
  debug: (msg, meta) => logger.debug(meta ? `${msg} ${JSON.stringify(meta)}` : msg),
  info: (msg, meta) => logger.info(meta ? `${msg} ${JSON.stringify(meta)}` : msg),
  warn: (msg) => logger.error(`WARN: ${msg}`),
  error: (msg) => logger.error(msg),
  startTimer: (label) => {
    const start = Date.now();
    return () => logger.debug(`[${label}] ${Date.now() - start}ms`);
  },
};

const DEFAULT_SYSTEM_PROMPT = `You are Confucius, an AI coding assistant.

You can use these tools:
<bash>command</bash> - Execute shell commands
<file_edit><path>filepath</path><content>content</content></file_edit> - Create or edit files
<think>reasoning</think> - Internal reasoning (not shown to user)
<finish>completion message</finish> - Signal that the task is complete

IMPORTANT: When you have completed the requested task, you MUST use the <finish> tool to signal completion.
Example: <finish>Task completed. Created proof.txt with the requested content.</finish>

Do NOT keep repeating actions after they succeed. Once the task is done, use <finish> immediately.
`;

program
  .name('confucius')
  .description('Confucius Code Agent CLI')
  .version('2.0.0-alpha.1')
  .argument('<task>', 'The task to execute')
  .option('-p, --provider <type>', 'openai, anthropic, or openrouter', 'openrouter')
  .option('-m, --model <name>', 'Model name', 'anthropic/claude-3.5-sonnet')
  .option('-k, --api-key <key>', 'API key (or set via env: OPENAI_API_KEY, ANTHROPIC_API_KEY, OPENROUTER_API_KEY)')
  .option('-v, --verbose', 'Enable debug logs')
  .action(async (task, options) => {
    if (options.verbose) logger.setLevel('debug');
    
    logger.info('Initializing Confucius Agent...');
    
    const llmClient = new LLMClient({
      provider: options.provider,
      model: options.model,
      apiKey: options.apiKey,
    });

    const config: RunConfig = {
      maxIterations: 10,
      compressionThreshold: 5000, // Trigger compression around ~5K tokens
      enabledExtensions: ['bash', 'file_edit', 'think', 'finish'],
      model: {
        provider: options.provider,
        name: options.model,
        supportsToolUse: true,
      },
    };

    // Create registry and register built-in extensions
    const registry = new ExtensionRegistry(sdkLogger);
    registry.register(createBashExtension());
    registry.register(createFileEditExtension());
    registry.register(createThinkExtension());
    registry.register(createFinishExtension());

    const agent = new ConfuciusOrchestrator({
      llm: new LLMClientAdapter(llmClient),
      registry,
      logger: sdkLogger,
      artifacts: new MemoryArtifactStore(),
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      config,
      workingDirectory: process.cwd(),
    });
    
    logger.agent('Confucius', `Starting task: "${task}"`);
    const result = await agent.run(task);
    
    if (result.terminationReason === 'completed') {
      logger.success('Task completed successfully');
    } else {
      logger.info(`Task ended: ${result.terminationReason}`);
    }
  });

program.parse();
