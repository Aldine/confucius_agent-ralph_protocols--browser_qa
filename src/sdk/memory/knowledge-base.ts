/**
 * Confucius SDK - Knowledge Base Manager
 * 
 * Manages persistent rules and best practices in .ralph/knowledge.md.
 * The Meta-Agent writes learned rules here, and they are loaded into
 * the Session Scope on each run.
 * 
 * @see https://arxiv.org/abs/2512.10398v5 Section 2.3.3 (Self-Improvement Loop)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { Logger } from '../types.js';

/**
 * KnowledgeBase - Persistent storage for learned rules.
 */
export class KnowledgeBase {
  private logger: Logger;
  private workingDirectory: string;
  private knowledgePath: string;

  constructor(logger: Logger, workingDirectory: string) {
    this.logger = logger;
    this.workingDirectory = workingDirectory;
    this.knowledgePath = path.join(workingDirectory, '.ralph', 'knowledge.md');
  }

  /**
   * Load all rules from the knowledge base.
   * Returns empty string if the file doesn't exist.
   */
  async loadRules(): Promise<string> {
    try {
      const content = await fs.readFile(this.knowledgePath, 'utf-8');
      this.logger.info('[KnowledgeBase] Rules loaded', {
        path: this.knowledgePath,
        length: content.length,
      });
      return content;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.logger.debug('[KnowledgeBase] No knowledge file found, starting fresh');
        return '';
      }
      this.logger.error('[KnowledgeBase] Failed to load rules', {
        error: error instanceof Error ? error.message : String(error),
      });
      return '';
    }
  }

  /**
   * Add a new rule to the knowledge base.
   * Creates the file and directory if they don't exist.
   */
  async addRule(rule: string): Promise<void> {
    if (!rule || rule.trim().length === 0) {
      this.logger.warn('[KnowledgeBase] Attempted to add empty rule, skipping');
      return;
    }

    try {
      // Ensure .ralph directory exists
      const ralphDir = path.join(this.workingDirectory, '.ralph');
      await fs.mkdir(ralphDir, { recursive: true });

      // Check if file exists and has content
      let existingContent = '';
      try {
        existingContent = await fs.readFile(this.knowledgePath, 'utf-8');
      } catch {
        // File doesn't exist, will create with header
        existingContent = '';
      }

      // Format the new rule entry
      const timestamp = new Date().toISOString();
      const ruleEntry = `\n## Rule (${timestamp})\n${rule.trim()}\n`;

      // If file is empty, add header
      let newContent: string;
      if (existingContent.trim().length === 0) {
        newContent = `# Confucius Knowledge Base\n\nLearned rules and best practices from previous sessions.\n${ruleEntry}`;
      } else {
        newContent = existingContent + ruleEntry;
      }

      await fs.writeFile(this.knowledgePath, newContent, 'utf-8');
      
      this.logger.info('[KnowledgeBase] Rule added', {
        path: this.knowledgePath,
        rulePreview: rule.substring(0, 100),
      });
    } catch (error) {
      this.logger.error('[KnowledgeBase] Failed to add rule', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get the path to the knowledge file.
   */
  getPath(): string {
    return this.knowledgePath;
  }

  /**
   * Check if the knowledge base has any rules.
   */
  async hasRules(): Promise<boolean> {
    const rules = await this.loadRules();
    return rules.trim().length > 0;
  }

  /**
   * Clear all rules (useful for testing).
   */
  async clear(): Promise<void> {
    try {
      await fs.unlink(this.knowledgePath);
      this.logger.info('[KnowledgeBase] Cleared');
    } catch {
      // File might not exist, that's fine
    }
  }
}

/**
 * Create a new KnowledgeBase instance.
 */
export function createKnowledgeBase(logger: Logger, workingDirectory: string): KnowledgeBase {
  return new KnowledgeBase(logger, workingDirectory);
}
