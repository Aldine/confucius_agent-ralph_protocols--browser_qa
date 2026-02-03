/**
 * Confucius SDK - Extension Registry
 * 
 * Manages registration, lookup, and routing of extensions.
 * Extensions are the modular components that define tool behavior.
 * 
 * @see https://arxiv.org/abs/2512.10398v5 Section 2.3.3
 */

import type { 
  IExtension, 
  ParsedAction, 
  ExecutionResult, 
  RunContext,
  Logger 
} from './types.js';

/**
 * ExtensionRegistry - Central registry for all agent extensions.
 * 
 * Responsibilities:
 * - Register extensions by name and trigger tag
 * - Route LLM output to appropriate extension parsers
 * - Execute actions through the correct extension
 * - Provide extension introspection for meta-agent
 */
export class ExtensionRegistry {
  private extensions: Map<string, IExtension> = new Map();
  private tagToExtension: Map<string, IExtension> = new Map();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Register an extension with the registry.
   * 
   * @param extension - The extension to register
   * @throws If extension name or triggerTag already registered
   */
  register(extension: IExtension): void {
    // Validate no duplicate names
    if (this.extensions.has(extension.name)) {
      throw new Error(
        `Extension with name "${extension.name}" already registered`
      );
    }

    // Validate no duplicate trigger tags
    if (this.tagToExtension.has(extension.triggerTag)) {
      const existing = this.tagToExtension.get(extension.triggerTag);
      throw new Error(
        `Trigger tag "<${extension.triggerTag}>" already registered by extension "${existing?.name}"`
      );
    }

    // Register by name and tag
    this.extensions.set(extension.name, extension);
    this.tagToExtension.set(extension.triggerTag, extension);

    this.logger.info(`Registered extension: ${extension.name}`, {
      triggerTag: extension.triggerTag,
      description: extension.description,
    });
  }

  /**
   * Register multiple extensions at once.
   */
  registerAll(extensions: IExtension[]): void {
    for (const ext of extensions) {
      this.register(ext);
    }
  }

  /**
   * Get an extension by name.
   */
  get(name: string): IExtension | undefined {
    return this.extensions.get(name);
  }

  /**
   * Get an extension by its trigger tag.
   */
  getByTag(tag: string): IExtension | undefined {
    return this.tagToExtension.get(tag);
  }

  /**
   * Check if an extension is registered.
   */
  has(name: string): boolean {
    return this.extensions.has(name);
  }

  /**
   * Get all registered extension names.
   */
  listNames(): string[] {
    return Array.from(this.extensions.keys());
  }

  /**
   * Get all registered extensions.
   */
  listAll(): IExtension[] {
    return Array.from(this.extensions.values());
  }

  /**
   * Get all registered trigger tags.
   */
  listTags(): string[] {
    return Array.from(this.tagToExtension.keys());
  }

  /**
   * Unregister an extension by name.
   */
  unregister(name: string): boolean {
    const extension = this.extensions.get(name);
    if (!extension) {
      return false;
    }

    this.extensions.delete(name);
    this.tagToExtension.delete(extension.triggerTag);
    
    this.logger.info(`Unregistered extension: ${name}`);
    return true;
  }

  /**
   * Parse LLM output and extract all tagged actions.
   * 
   * Scans the output for XML-style tags matching registered extensions
   * and returns an array of parsed actions.
   * 
   * @param output - Raw LLM output text
   * @returns Array of parsed actions with their source extensions
   */
  parseOutput(output: string): Array<{ extension: IExtension; action: ParsedAction }> {
    const actions: Array<{ extension: IExtension; action: ParsedAction }> = [];

    // Build regex to match any registered tag
    const tags = this.listTags();
    if (tags.length === 0) {
      return actions;
    }

    // Match <tag>content</tag> or <tag attr="value">content</tag>
    const tagPattern = tags.map(t => this.escapeRegex(t)).join('|');
    const regex = new RegExp(
      `<(${tagPattern})(?:\\s[^>]*)?>([\\s\\S]*?)<\\/\\1>`,
      'gi'
    );

    let match: RegExpExecArray | null;
    while ((match = regex.exec(output)) !== null) {
      const [, tagName, content] = match;
      const extension = this.tagToExtension.get(tagName.toLowerCase());

      if (extension) {
        const timer = this.logger.startTimer(`parse:${extension.name}`);
        try {
          const action = extension.parse(content.trim());
          if (action) {
            actions.push({ extension, action });
            this.logger.debug(`Parsed action from <${tagName}>`, {
              extension: extension.name,
              parameters: action.parameters,
            });
          } else {
            this.logger.warn(`Extension ${extension.name} returned null for content`, {
              contentPreview: content.substring(0, 100),
            });
          }
        } catch (error) {
          this.logger.error(`Parse error in extension ${extension.name}`, {
            error: error instanceof Error ? error.message : String(error),
            content: content.substring(0, 200),
          });
        } finally {
          timer();
        }
      }
    }

    return actions;
  }

  /**
   * Execute a parsed action through its extension.
   * 
   * @param extension - The extension to execute
   * @param action - The parsed action
   * @param context - Runtime context
   * @returns Execution result
   */
  async execute(
    extension: IExtension,
    action: ParsedAction,
    context: RunContext
  ): Promise<ExecutionResult> {
    const timer = this.logger.startTimer(`execute:${extension.name}`);
    
    try {
      this.logger.info(`Executing ${extension.name}`, {
        tool: action.tool,
        parameters: action.parameters,
      });

      const result = await extension.execute(action, context);

      this.logger.info(`${extension.name} completed`, {
        success: result.success,
        outputPreview: result.output.substring(0, 100),
      });

      return result;
    } catch (error) {
      this.logger.error(`Execution error in ${extension.name}`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      return {
        success: false,
        output: `Error executing ${extension.name}: ${error instanceof Error ? error.message : String(error)}`,
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          recoverable: true,
        },
      };
    } finally {
      timer();
    }
  }

  /**
   * Apply onInputMessages callbacks from all extensions.
   * 
   * @param messages - Current message array
   * @param context - Runtime context
   * @returns Potentially modified messages
   */
  applyInputCallbacks(
    messages: import('./types.js').Message[],
    context: RunContext
  ): import('./types.js').Message[] {
    let result = messages;

    for (const extension of this.extensions.values()) {
      if (extension.onInputMessages) {
        try {
          result = extension.onInputMessages(result, context);
        } catch (error) {
          this.logger.error(`onInputMessages error in ${extension.name}`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return result;
  }

  /**
   * Apply onLLMOutput callbacks from all extensions.
   * 
   * @param output - Raw LLM output
   * @param context - Runtime context
   * @returns Potentially modified output
   */
  applyOutputCallbacks(output: string, context: RunContext): string {
    let result = output;

    for (const extension of this.extensions.values()) {
      if (extension.onLLMOutput) {
        try {
          result = extension.onLLMOutput(result, context);
        } catch (error) {
          this.logger.error(`onLLMOutput error in ${extension.name}`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return result;
  }

  /**
   * Generate tool documentation for the system prompt.
   * 
   * Creates a formatted list of available tools for the LLM.
   */
  generateToolDocs(): string {
    const docs: string[] = ['# Available Tools\n'];

    for (const ext of this.extensions.values()) {
      docs.push(`## <${ext.triggerTag}>`);
      docs.push(`${ext.description}\n`);
    }

    return docs.join('\n');
  }

  /**
   * Get registry statistics for observability.
   */
  getStats(): {
    extensionCount: number;
    extensions: Array<{ name: string; tag: string }>;
  } {
    return {
      extensionCount: this.extensions.size,
      extensions: Array.from(this.extensions.values()).map(e => ({
        name: e.name,
        tag: e.triggerTag,
      })),
    };
  }

  /**
   * Escape special regex characters in a string.
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

/**
 * Create a new extension registry with the given logger.
 */
export function createRegistry(logger: Logger): ExtensionRegistry {
  return new ExtensionRegistry(logger);
}
