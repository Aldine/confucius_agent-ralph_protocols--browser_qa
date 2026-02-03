/**
 * FileEdit Extension - Create and modify files
 * 
 * Allows the agent to create, edit, and read files safely.
 * Supports both full file writes and partial replacements.
 * 
 * @example
 * LLM output: <file_edit type="create" path="src/foo.ts">content here</file_edit>
 * LLM output: <file_edit type="replace" path="src/foo.ts">
 *   <old>old content</old>
 *   <new>new content</new>
 * </file_edit>
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname, resolve, isAbsolute } from 'path';
import { existsSync } from 'fs';
import type { IExtension, ParsedAction, ExecutionResult, RunContext } from '../types.js';

/**
 * FileEditExtension configuration options.
 */
export interface FileEditExtensionOptions {
  /** Base directory for relative paths */
  basePath?: string;
  
  /** Allowed file extensions (empty = all allowed) */
  allowedExtensions?: string[];
  
  /** Blocked paths (for safety) */
  blockedPaths?: string[];
  
  /** Maximum file size in bytes */
  maxFileSize?: number;
}

const DEFAULT_OPTIONS: Required<FileEditExtensionOptions> = {
  basePath: process.cwd(),
  allowedExtensions: [], // All allowed by default
  blockedPaths: [
    '/etc',
    '/usr',
    '/bin',
    '/sbin',
    'node_modules',
    '.git',
  ],
  maxFileSize: 1024 * 1024, // 1MB
};

type EditType = 'create' | 'replace' | 'read' | 'append';

interface FileEditParams {
  type: EditType;
  path: string;
  content?: string;
  oldContent?: string;
  newContent?: string;
}

/**
 * FileEditExtension - File manipulation for the agent.
 */
export class FileEditExtension implements IExtension {
  readonly name = 'file_edit';
  readonly description = 'Create, modify, or read files. Types: create (new file), replace (find/replace), read (get contents), append (add to end).';
  readonly triggerTag = 'file_edit';
  readonly signalsContinuation = true;

  private options: Required<FileEditExtensionOptions>;

  constructor(options: FileEditExtensionOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Parse file edit parameters from LLM output.
   * 
   * Supports two formats:
   * 1. Attribute-based: <file_edit type="create" path="...">content</file_edit>
   * 2. Nested XML: <file_edit><path>...</path><content>...</content></file_edit>
   */
  parse(content: string): ParsedAction | null {
    // Try nested XML format first (preferred by LLMs like Claude)
    const nestedPathMatch = content.match(/<path>([\s\S]*?)<\/path>/i);
    const nestedContentMatch = content.match(/<content>([\s\S]*?)<\/content>/i);
    
    if (nestedPathMatch) {
      const path = nestedPathMatch[1].trim();
      const fileContent = nestedContentMatch ? nestedContentMatch[1] : '';
      
      // Detect operation type from content
      const oldMatch = content.match(/<old>([\s\S]*?)<\/old>/i);
      const newMatch = content.match(/<new>([\s\S]*?)<\/new>/i);
      
      if (oldMatch && newMatch) {
        return {
          tool: 'file_edit',
          parameters: {
            type: 'replace',
            path,
            oldContent: oldMatch[1],
            newContent: newMatch[1],
          } as unknown as Record<string, unknown>,
          rawContent: content,
        };
      }
      
      return {
        tool: 'file_edit',
        parameters: {
          type: 'create',
          path,
          content: fileContent,
        } as unknown as Record<string, unknown>,
        rawContent: content,
      };
    }

    // Fallback: Parse attributes from the tag
    const typeMatch = content.match(/type=["'](\w+)["']/i);
    const pathMatch = content.match(/path=["']([^"']+)["']/i);

    if (!typeMatch || !pathMatch) {
      return null;
    }

    const type = typeMatch[1].toLowerCase() as EditType;
    const path = pathMatch[1];

    const params: FileEditParams = { type, path };

    // For replace, extract old/new content
    if (type === 'replace') {
      const oldMatch = content.match(/<old>([\s\S]*?)<\/old>/i);
      const newMatch = content.match(/<new>([\s\S]*?)<\/new>/i);
      
      if (!oldMatch || !newMatch) {
        return null;
      }
      
      params.oldContent = oldMatch[1];
      params.newContent = newMatch[1];
    } else if (type === 'create' || type === 'append') {
      // Extract content after attributes
      const contentStart = content.indexOf('>') + 1;
      params.content = content.substring(contentStart).trim();
    }

    return {
      tool: 'file_edit',
      parameters: params as unknown as Record<string, unknown>,
      rawContent: content,
    };
  }

  /**
   * Execute the file operation.
   */
  async execute(action: ParsedAction, context: RunContext): Promise<ExecutionResult> {
    const params = action.parameters as unknown as FileEditParams;
    const filePath = this.resolvePath(params.path);

    // Safety check: blocked paths
    for (const blocked of this.options.blockedPaths) {
      if (filePath.includes(blocked)) {
        return {
          success: false,
          output: `Path "${params.path}" is blocked for safety`,
          error: {
            code: 'PATH_BLOCKED',
            message: `Cannot access paths containing "${blocked}"`,
            recoverable: true,
          },
        };
      }
    }

    // Safety check: allowed extensions
    if (this.options.allowedExtensions.length > 0) {
      const ext = params.path.split('.').pop() ?? '';
      if (!this.options.allowedExtensions.includes(ext)) {
        return {
          success: false,
          output: `File extension ".${ext}" is not allowed`,
          error: {
            code: 'EXTENSION_NOT_ALLOWED',
            message: `Allowed extensions: ${this.options.allowedExtensions.join(', ')}`,
            recoverable: true,
          },
        };
      }
    }

    context.logger.info('Executing file operation', {
      type: params.type,
      path: params.path,
    });

    try {
      switch (params.type) {
        case 'create':
          return await this.createFile(filePath, params.content ?? '', context);
        case 'replace':
          return await this.replaceInFile(
            filePath,
            params.oldContent ?? '',
            params.newContent ?? '',
            context
          );
        case 'read':
          return await this.readFileContent(filePath, context);
        case 'append':
          return await this.appendToFile(filePath, params.content ?? '', context);
        default: {
          const unknownType: string = params.type as string;
          return {
            success: false,
            output: `Unknown file operation type: ${unknownType}`,
            error: {
              code: 'UNKNOWN_OPERATION',
              message: `Supported types: create, replace, read, append`,
              recoverable: true,
            },
          };
        }
      }
    } catch (error) {
      return {
        success: false,
        output: `File operation failed: ${error instanceof Error ? error.message : String(error)}`,
        error: {
          code: 'FILE_OPERATION_FAILED',
          message: error instanceof Error ? error.message : String(error),
          recoverable: true,
        },
      };
    }
  }

  /**
   * Create a new file with content.
   */
  private async createFile(
    filePath: string,
    content: string,
    context: RunContext
  ): Promise<ExecutionResult> {
    // Ensure directory exists
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    await writeFile(filePath, content, 'utf-8');

    context.logger.info('File created', { path: filePath, size: content.length });

    return {
      success: true,
      output: `File created successfully at ${filePath}`,
      userOutput: `Created file: ${filePath}\n\n${content.substring(0, 500)}${content.length > 500 ? '\n...' : ''}`,
    };
  }

  /**
   * Replace content in an existing file.
   */
  private async replaceInFile(
    filePath: string,
    oldContent: string,
    newContent: string,
    context: RunContext
  ): Promise<ExecutionResult> {
    const current = await readFile(filePath, 'utf-8');

    if (!current.includes(oldContent)) {
      return {
        success: false,
        output: `Could not find the specified content to replace in ${filePath}`,
        error: {
          code: 'CONTENT_NOT_FOUND',
          message: 'The old content was not found in the file',
          recoverable: true,
          suggestion: 'Verify the old content matches exactly, including whitespace',
        },
      };
    }

    const updated = current.replace(oldContent, newContent);
    await writeFile(filePath, updated, 'utf-8');

    context.logger.info('File updated', { path: filePath });

    return {
      success: true,
      output: `File updated successfully: ${filePath}`,
      userOutput: `Updated ${filePath}:\n- ${oldContent.substring(0, 50)}...\n+ ${newContent.substring(0, 50)}...`,
    };
  }

  /**
   * Read file contents.
   */
  private async readFileContent(
    filePath: string,
    context: RunContext
  ): Promise<ExecutionResult> {
    const content = await readFile(filePath, 'utf-8');

    context.logger.info('File read', { path: filePath, size: content.length });

    // Truncate large files
    const maxRead = this.options.maxFileSize;
    const truncated = content.length > maxRead;
    const output = truncated ? content.substring(0, maxRead) : content;

    return {
      success: true,
      output: truncated ? `${output}\n... [truncated]` : output,
      userOutput: `Contents of ${filePath}:\n\n${output}${truncated ? '\n... [truncated]' : ''}`,
    };
  }

  /**
   * Append content to an existing file.
   */
  private async appendToFile(
    filePath: string,
    content: string,
    context: RunContext
  ): Promise<ExecutionResult> {
    const current = existsSync(filePath) ? await readFile(filePath, 'utf-8') : '';
    await writeFile(filePath, current + content, 'utf-8');

    context.logger.info('Content appended', { path: filePath, added: content.length });

    return {
      success: true,
      output: `Content appended to ${filePath}`,
      userOutput: `Appended to ${filePath}:\n${content.substring(0, 200)}${content.length > 200 ? '...' : ''}`,
    };
  }

  /**
   * Resolve a path relative to base directory.
   */
  private resolvePath(path: string): string {
    if (isAbsolute(path)) {
      return path;
    }
    return resolve(this.options.basePath, path);
  }
}

/**
 * Create a new FileEdit extension instance.
 */
export function createFileEditExtension(options?: FileEditExtensionOptions): FileEditExtension {
  return new FileEditExtension(options);
}
