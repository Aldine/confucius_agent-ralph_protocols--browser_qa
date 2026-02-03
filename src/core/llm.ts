/**
 * Confucius SDK - LLM Provider Implementation
 * 
 * Connects the orchestrator to real language models (OpenAI, Anthropic).
 * Uses a standard OpenAI-compatible interface for portability.
 */

import type { Message, LLMResponse, Logger } from '../sdk/types.js';

// ============================================================================
// Configuration Types
// ============================================================================

export interface LLMConfig {
  /** API provider: 'openai' | 'anthropic' | 'openai-compatible' */
  provider: 'openai' | 'anthropic' | 'openai-compatible';
  
  /** API key (or uses environment variable) */
  apiKey?: string;
  
  /** Model name (e.g., 'gpt-4o', 'claude-3-5-sonnet-20241022') */
  model: string;
  
  /** Base URL for API (for OpenAI-compatible endpoints) */
  baseUrl?: string;
  
  /** Maximum tokens for completion */
  maxTokens?: number;
  
  /** Temperature (0-1) */
  temperature?: number;
  
  /** Request timeout in milliseconds */
  timeout?: number;
}

// ============================================================================
// Default Configurations
// ============================================================================

const DEFAULT_CONFIG: Partial<LLMConfig> = {
  maxTokens: 4096,
  temperature: 0.1,
  timeout: 120000, // 2 minutes
};

const PROVIDER_DEFAULTS: Record<string, Partial<LLMConfig>> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-4-20250514',
  },
};

// ============================================================================
// LLM Provider Implementation
// ============================================================================

/**
 * LLMProvider - Connects to language model APIs.
 * 
 * Supports:
 * - OpenAI (GPT-4o, GPT-4-turbo, etc.)
 * - Anthropic (Claude 3.5, Claude 3, etc.)
 * - OpenAI-compatible endpoints (local models, Azure, etc.)
 */
export class LLMProvider {
  private config: Required<LLMConfig>;
  private logger: Logger;

  constructor(config: LLMConfig, logger: Logger) {
    // Merge defaults
    const providerDefaults = PROVIDER_DEFAULTS[config.provider] ?? {};
    this.config = {
      ...DEFAULT_CONFIG,
      ...providerDefaults,
      ...config,
    } as Required<LLMConfig>;

    this.logger = logger;

    // Resolve API key from environment if not provided
    if (this.config.apiKey === '' || this.config.apiKey === undefined) {
      const envKey = this.getApiKeyFromEnv();
      if (envKey !== undefined) {
        this.config.apiKey = envKey;
      }
    }

    if (this.config.apiKey === '' || this.config.apiKey === undefined) {
      throw new Error(
        `No API key provided for ${config.provider}. ` +
        `Set ${this.getEnvVarName()} environment variable or pass apiKey in config.`
      );
    }

    this.logger.info('LLM Provider initialized', {
      provider: this.config.provider,
      model: this.config.model,
      maxTokens: this.config.maxTokens,
    });
  }

  /**
   * Invoke the LLM with a system prompt and messages.
   */
  async invoke(systemPrompt: string, messages: Message[]): Promise<LLMResponse> {
    const timer = this.logger.startTimer('llm:invoke');

    try {
      if (this.config.provider === 'anthropic') {
        return await this.invokeAnthropic(systemPrompt, messages);
      } else {
        return await this.invokeOpenAI(systemPrompt, messages);
      }
    } finally {
      timer();
    }
  }

  // --------------------------------------------------------------------------
  // OpenAI Implementation
  // --------------------------------------------------------------------------

  private async invokeOpenAI(
    systemPrompt: string,
    messages: Message[]
  ): Promise<LLMResponse> {
    const url = `${this.config.baseUrl}/chat/completions`;

    // Convert messages to OpenAI format
    const openaiMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...messages.map(m => ({
        role: m.role === 'tool' ? ('user' as const) : (m.role as 'user' | 'assistant'),
        content: m.role === 'tool' ? `[Tool Result: ${m.toolName}]\n${m.content}` : m.content,
      })),
    ];

    this.logger.debug('Sending request to OpenAI', {
      model: this.config.model,
      messageCount: openaiMessages.length,
    });

    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: openaiMessages,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${error}`);
    }

    const data = await response.json() as OpenAIResponse;

    return {
      content: data.choices[0]?.message?.content ?? '',
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      stopReason: this.mapOpenAIStopReason(data.choices[0]?.finish_reason),
    };
  }

  // --------------------------------------------------------------------------
  // Anthropic Implementation
  // --------------------------------------------------------------------------

  private async invokeAnthropic(
    systemPrompt: string,
    messages: Message[]
  ): Promise<LLMResponse> {
    const url = `${this.config.baseUrl}/messages`;

    // Convert messages to Anthropic format
    const anthropicMessages = messages.map(m => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: m.role === 'tool' ? `[Tool Result: ${m.toolName}]\n${m.content}` : m.content,
    }));

    // Anthropic requires alternating user/assistant messages
    const consolidatedMessages = this.consolidateMessages(anthropicMessages);

    this.logger.debug('Sending request to Anthropic', {
      model: this.config.model,
      messageCount: consolidatedMessages.length,
    });

    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.model,
        system: systemPrompt,
        messages: consolidatedMessages,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${error}`);
    }

    const data = await response.json() as AnthropicResponse;

    // Extract text from content blocks
    const content = data.content
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map(block => block.text)
      .join('');

    return {
      content,
      usage: {
        promptTokens: data.usage?.input_tokens ?? 0,
        completionTokens: data.usage?.output_tokens ?? 0,
        totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
      },
      stopReason: this.mapAnthropicStopReason(data.stop_reason),
    };
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  /**
   * Fetch with timeout support.
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Consolidate consecutive messages of the same role (Anthropic requirement).
   */
  private consolidateMessages(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    const result: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    for (const msg of messages) {
      const last = result[result.length - 1];
      if (last !== undefined && last.role === msg.role) {
        // Merge with previous message
        last.content += '\n\n' + msg.content;
      } else {
        result.push({ ...msg });
      }
    }

    // Ensure we start with a user message
    const first = result[0];
    if (first !== undefined && first.role !== 'user') {
      result.unshift({ role: 'user', content: '[Starting task]' });
    }

    return result;
  }

  /**
   * Map OpenAI stop reason to our format.
   */
  private mapOpenAIStopReason(
    reason: string | undefined
  ): LLMResponse['stopReason'] {
    switch (reason) {
      case 'stop':
        return 'end_turn';
      case 'length':
        return 'max_tokens';
      case 'tool_calls':
        return 'tool_use';
      default:
        return 'end_turn';
    }
  }

  /**
   * Map Anthropic stop reason to our format.
   */
  private mapAnthropicStopReason(
    reason: string | undefined
  ): LLMResponse['stopReason'] {
    switch (reason) {
      case 'end_turn':
        return 'end_turn';
      case 'max_tokens':
        return 'max_tokens';
      case 'tool_use':
        return 'tool_use';
      case 'stop_sequence':
        return 'stop_sequence';
      default:
        return 'end_turn';
    }
  }

  /**
   * Get API key from environment variable.
   */
  private getApiKeyFromEnv(): string | undefined {
    const envVar = this.getEnvVarName();
    return process.env[envVar];
  }

  /**
   * Get environment variable name for API key.
   */
  private getEnvVarName(): string {
    switch (this.config.provider) {
      case 'anthropic':
        return 'ANTHROPIC_API_KEY';
      case 'openai':
      case 'openai-compatible':
      default:
        return 'OPENAI_API_KEY';
    }
  }
}

// ============================================================================
// Response Types (Internal)
// ============================================================================

interface OpenAIResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface AnthropicResponse {
  id: string;
  content: Array<{
    type: string;
    text?: string;
  }>;
  stop_reason?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create an LLM provider instance.
 */
export function createLLMProvider(config: LLMConfig, logger: Logger): LLMProvider {
  return new LLMProvider(config, logger);
}

/**
 * Create a provider from environment variables.
 * 
 * Checks for:
 * - ANTHROPIC_API_KEY → uses Anthropic
 * - OPENAI_API_KEY → uses OpenAI
 */
export function createLLMProviderFromEnv(logger: Logger): LLMProvider {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey !== undefined && anthropicKey !== '') {
    return createLLMProvider({
      provider: 'anthropic',
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514',
    }, logger);
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey !== undefined && openaiKey !== '') {
    return createLLMProvider({
      provider: 'openai',
      model: process.env.OPENAI_MODEL ?? 'gpt-4o',
    }, logger);
  }

  throw new Error(
    'No LLM API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable.'
  );
}
