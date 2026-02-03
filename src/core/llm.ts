import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { logger } from './logger.js';

export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'openrouter';
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

export class LLMClient {
  private openai?: OpenAI;
  private anthropic?: Anthropic;

  constructor(private config: LLMConfig) {
    if (config.provider === 'openai') {
      this.openai = new OpenAI({ apiKey: config.apiKey || process.env.OPENAI_API_KEY });
    } else if (config.provider === 'openrouter') {
      this.openai = new OpenAI({
        apiKey: config.apiKey || process.env.OPENROUTER_API_KEY,
        baseURL: config.baseUrl || 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': 'https://github.com/Aldine/confucius-agent',
          'X-Title': 'Confucius Agent',
        },
      });
    } else {
      this.anthropic = new Anthropic({ apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY });
    }
  }

  async chat(system: string, user: string): Promise<string> {
    logger.debug(`Sending to ${this.config.provider}...`);
    try {
      if (this.config.provider === 'openai' || this.config.provider === 'openrouter') {
        const res = await this.openai!.chat.completions.create({
          model: this.config.model,
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        });
        const content = res.choices[0]?.message?.content || '';
        logger.debug(`LLM response: ${content.substring(0, 200)}${content.length > 200 ? '...' : ''}`);
        return content;
      } else {
        const res = await this.anthropic!.messages.create({
          model: this.config.model,
          system: system,
          messages: [{ role: 'user', content: user }],
          max_tokens: 4096,
        });
        const content = res.content[0].type === 'text' ? res.content[0].text : '';
        logger.debug(`LLM response: ${content.substring(0, 200)}${content.length > 200 ? '...' : ''}`);
        return content;
      }
    } catch (err: any) {
      logger.error(`LLM Error: ${err.message}`);
      throw err;
    }
  }
}
