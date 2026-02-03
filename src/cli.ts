#!/usr/bin/env node
/**
 * Confucius CLI - The "Voice" of the Agent
 * 
 * Entry point for running the Confucius agent from the terminal.
 * 
 * Usage:
 *   confucius "fix the bug in src/app.ts"
 *   confucius --model gpt-4o "add error handling"
 *   confucius --provider anthropic "refactor this function"
 */

import { Command } from 'commander';
import { createInterface } from 'readline';

import { createOrchestrator, createRegistry } from './sdk/index.js';
import { createBashExtension, createFileEditExtension, createThinkExtension } from './sdk/extensions/index.js';
import { createLLMProvider, createLLMProviderFromEnv, createLogger } from './core/index.js';
import type { LLMConfig } from './core/index.js';
import type { Artifact, ArtifactStore } from './sdk/types.js';

// ============================================================================
// CLI Definition
// ============================================================================

const program = new Command();

program
  .name('confucius')
  .description('🔮 Confucius Code Agent - A scalable agent scaffold for real-world codebases')
  .version('2.0.0-alpha.1')
  .argument('[task]', 'The task for the agent to perform')
  .option('-p, --provider <provider>', 'LLM provider: openai, anthropic, openai-compatible', 'anthropic')
  .option('-m, --model <model>', 'Model name (e.g., gpt-4o, claude-sonnet-4-20250514)')
  .option('-k, --api-key <key>', 'API key (or use environment variable)')
  .option('-b, --base-url <url>', 'Base URL for OpenAI-compatible endpoints')
  .option('-w, --working-dir <dir>', 'Working directory for file operations', process.cwd())
  .option('-i, --max-iterations <n>', 'Maximum iterations', '50')
  .option('-t, --temperature <n>', 'Temperature (0-1)', '0.1')
  .option('-v, --verbose', 'Enable verbose/debug logging')
  .option('--stdin', 'Read task from stdin')
  .action(async (task: string | undefined, options: CLIOptions) => {
    await runAgent(task, options);
  });

program.parse();

// ============================================================================
// Types
// ============================================================================

interface CLIOptions {
  provider: 'openai' | 'anthropic' | 'openai-compatible';
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  workingDir: string;
  maxIterations: string;
  temperature: string;
  verbose?: boolean;
  stdin?: boolean;
}

// ============================================================================
// Main Agent Runner
// ============================================================================

async function runAgent(task: string | undefined, options: CLIOptions): Promise<void> {
  // Read task from stdin if specified
  if (options.stdin === true) {
    task = await readStdin();
  }

  if (task === undefined || task === '') {
    // eslint-disable-next-line no-console
    console.error('❌ No task provided. Usage: confucius "your task here"');
    // eslint-disable-next-line no-console
    console.error('   Or pipe input: echo "your task" | confucius --stdin');
    process.exit(1);
  }

  // Initialize logger
  const logger = createLogger({
    level: options.verbose === true ? 'debug' : 'info',
    colors: true,
    timestamps: true,
    prefix: '🔮 Confucius',
  });

  logger.info('Starting Confucius Code Agent');
  logger.info(`Task: ${task.substring(0, 100)}${task.length > 100 ? '...' : ''}`);

  try {
    // Initialize LLM provider
    const llm = createLLM(options, logger);

    // Initialize extension registry
    const registry = createRegistry(logger);

    // Register default extensions
    registry.registerAll([
      createBashExtension({ cwd: options.workingDir }),
      createFileEditExtension({ basePath: options.workingDir }),
      createThinkExtension(),
    ]);

    logger.info('Extensions registered', {
      extensions: registry.listNames(),
    });

    // Create artifact store (simple in-memory for now)
    const artifacts = createArtifactStore();

    // Create orchestrator
    const orchestrator = createOrchestrator({
      llm,
      registry,
      logger,
      artifacts,
      systemPrompt: createSystemPrompt(options.workingDir),
      config: {
        maxIterations: parseInt(options.maxIterations, 10),
        compressionThreshold: 80000, // ~80k tokens before compression
        enabledExtensions: registry.listNames(),
        model: {
          provider: options.provider,
          name: options.model ?? 'auto',
          supportsToolUse: true,
        },
      },
    });

    // Run the agent
    logger.info('Starting orchestrator loop...');
    const result = await orchestrator.run(task);

    // Output result
    // eslint-disable-next-line no-console
    console.log('\n' + '═'.repeat(60));
    
    if (result.result?.success === true) {
      // eslint-disable-next-line no-console
      console.log('✅ Task completed successfully');
      // eslint-disable-next-line no-console
      console.log('═'.repeat(60));
      // eslint-disable-next-line no-console
      console.log(result.result.output);
    } else {
      // eslint-disable-next-line no-console
      console.log('❌ Task failed');
      // eslint-disable-next-line no-console
      console.log('═'.repeat(60));
      // eslint-disable-next-line no-console
      console.log(result.result?.output ?? 'No output');
      if (result.result?.error !== undefined) {
        // eslint-disable-next-line no-console
        console.error('Error:', result.result.error.message);
      }
    }

    // eslint-disable-next-line no-console
    console.log('═'.repeat(60));
    // eslint-disable-next-line no-console
    console.log(`Iterations: ${result.iteration}`);
    // eslint-disable-next-line no-console
    console.log(`Termination: ${result.terminationReason ?? 'unknown'}`);

    // Exit with appropriate code
    process.exit(result.result?.success === true ? 0 : 1);

  } catch (error) {
    logger.error('Fatal error', {
      error: error instanceof Error ? error.message : String(error),
    });
    // eslint-disable-next-line no-console
    console.error('\n❌ Agent crashed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// ============================================================================
// Helpers
// ============================================================================

function createLLM(options: CLIOptions, logger: ReturnType<typeof createLogger>): ReturnType<typeof createLLMProvider> {
  // If API key provided, use explicit config
  if (options.apiKey !== undefined && options.apiKey !== '') {
    const config: LLMConfig = {
      provider: options.provider,
      apiKey: options.apiKey,
      model: options.model ?? getDefaultModel(options.provider),
      baseUrl: options.baseUrl,
      temperature: parseFloat(options.temperature),
    };
    return createLLMProvider(config, logger);
  }

  // Otherwise, try to create from environment
  try {
    return createLLMProviderFromEnv(logger);
  } catch {
    // eslint-disable-next-line no-console
    console.error('❌ No API key found.');
    // eslint-disable-next-line no-console
    console.error('   Set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable,');
    // eslint-disable-next-line no-console
    console.error('   or use --api-key flag.');
    process.exit(1);
  }
}

function getDefaultModel(provider: string): string {
  switch (provider) {
    case 'anthropic':
      return 'claude-sonnet-4-20250514';
    case 'openai':
    case 'openai-compatible':
    default:
      return 'gpt-4o';
  }
}

function createSystemPrompt(workingDir: string): string {
  return `You are Confucius, an expert software engineering agent.

## Your Capabilities
You can execute tasks by using tools enclosed in XML tags:

### <bash>command</bash>
Execute shell commands. Use for:
- Running scripts, tests, builds
- File system operations (ls, cat, grep)
- Git operations
- Installing dependencies

### <file_edit type="create" path="path/to/file">content</file_edit>
Create a new file with the specified content.

### <file_edit type="replace" path="path/to/file">
<old>exact text to find</old>
<new>replacement text</new>
</file_edit>
Replace text in an existing file. The old text must match exactly.

### <file_edit type="read" path="path/to/file"></file_edit>
Read the contents of a file.

### <file_edit type="append" path="path/to/file">content to append</file_edit>
Append content to the end of a file.

### <think>your reasoning</think>
Think through a problem step by step. Use this to plan before acting.

## Working Directory
You are operating in: ${workingDir}

## Guidelines
1. **Think before acting**: Use <think> to plan complex tasks
2. **Verify your work**: Run tests or check outputs after making changes
3. **Be precise**: When editing files, include enough context to match uniquely
4. **Handle errors**: If a command fails, analyze the error and try a different approach
5. **Stay focused**: Complete the user's task, don't add unrequested features
6. **Explain your actions**: Briefly describe what you're doing and why

## Response Format
When you have completed the task or cannot proceed, respond in plain text (no XML tags) with:
- A summary of what was accomplished
- Any important notes or warnings
- Suggestions for next steps if applicable

Begin by understanding the task, then take action.`;
}

function createArtifactStore(): ArtifactStore {
  const store = new Map<string, Artifact>();
  
  return {
    save: (artifact: Artifact): Promise<string> => {
      const id = artifact.id !== undefined && artifact.id !== '' ? artifact.id : `artifact_${Date.now()}`;
      store.set(id, { ...artifact, id });
      return Promise.resolve(id);
    },
    get: (id: string): Promise<Artifact | null> => {
      return Promise.resolve(store.get(id) ?? null);
    },
    list: (): Promise<Artifact[]> => {
      return Promise.resolve(Array.from(store.values()));
    },
  };
}

async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    const rl = createInterface({
      input: process.stdin,
      terminal: false,
    });

    rl.on('line', (line) => {
      data += line + '\n';
    });

    rl.on('close', () => {
      resolve(data.trim());
    });

    // Timeout after 5 seconds if no input
    setTimeout(() => {
      rl.close();
      resolve(data.trim());
    }, 5000);
  });
}
