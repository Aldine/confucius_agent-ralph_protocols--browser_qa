/**
 * Bash Extension - Execute shell commands
 * 
 * Allows the agent to run terminal commands and receive output.
 * Implements guardrails for safe command execution.
 * 
 * @example
 * LLM output: <bash>ls -la src/</bash>
 * Parsed: { tool: 'bash', parameters: { command: 'ls -la src/' } }
 */

import { spawn } from 'child_process';
import type { IExtension, ParsedAction, ExecutionResult, RunContext } from '../types.js';

/**
 * BashExtension configuration options.
 */
export interface BashExtensionOptions {
  /** Working directory for commands */
  cwd?: string;
  
  /** Command timeout in milliseconds */
  timeout?: number;
  
  /** Maximum output length before truncation */
  maxOutputLength?: number;
  
  /** Blocked command patterns (for safety) */
  blockedPatterns?: RegExp[];
  
  /** Whether to use PowerShell on Windows */
  usePowerShell?: boolean;
}

const DEFAULT_OPTIONS: Required<BashExtensionOptions> = {
  cwd: process.cwd(),
  timeout: 30000,
  maxOutputLength: 10000,
  blockedPatterns: [
    /rm\s+-rf\s+\//, // Dangerous recursive delete
    /:(){ :|:& };:/, // Fork bomb
    />\s*\/dev\/sd/, // Direct disk writes
  ],
  usePowerShell: process.platform === 'win32',
};

/**
 * BashExtension - Shell command execution for the agent.
 */
export class BashExtension implements IExtension {
  readonly name = 'bash';
  readonly description = 'Execute shell commands and return output. Use for file operations, running scripts, checking system state.';
  readonly triggerTag = 'bash';
  readonly signalsContinuation = true;

  private options: Required<BashExtensionOptions>;

  constructor(options: BashExtensionOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Parse the command from LLM output.
   */
  parse(content: string): ParsedAction | null {
    const command = content.trim();
    
    if (!command) {
      return null;
    }

    return {
      tool: 'bash',
      parameters: { command },
      rawContent: content,
    };
  }

  /**
   * Execute the shell command.
   */
  async execute(action: ParsedAction, context: RunContext): Promise<ExecutionResult> {
    const command = action.parameters.command as string;

    // Safety check: blocked patterns
    for (const pattern of this.options.blockedPatterns) {
      if (pattern.test(command)) {
        return {
          success: false,
          output: `Command blocked by safety policy: matches pattern ${pattern}`,
          error: {
            code: 'COMMAND_BLOCKED',
            message: 'Command matches a blocked pattern',
            recoverable: true,
            suggestion: 'Use a safer alternative command',
          },
        };
      }
    }

    context.logger.info('Executing bash command', { command });

    try {
      const result = await this.runCommand(command);
      
      // Truncate if too long
      let output = result.stdout;
      if (output.length > this.options.maxOutputLength) {
        output = output.substring(0, this.options.maxOutputLength) +
          `\n... [truncated, ${result.stdout.length - this.options.maxOutputLength} more characters]`;
      }

      if (result.exitCode !== 0) {
        return {
          success: false,
          output: `Command exited with code ${result.exitCode}\n\nSTDOUT:\n${output}\n\nSTDERR:\n${result.stderr}`,
          userOutput: `$ ${command}\n${output}${result.stderr ? `\n\nSTDERR:\n${result.stderr}` : ''}`,
          error: {
            code: 'NON_ZERO_EXIT',
            message: `Exit code: ${result.exitCode}`,
            recoverable: true,
          },
        };
      }

      return {
        success: true,
        output: output || '(no output)',
        userOutput: `$ ${command}\n${output || '(no output)'}`,
      };
    } catch (error) {
      return {
        success: false,
        output: `Failed to execute command: ${error instanceof Error ? error.message : String(error)}`,
        error: {
          code: 'EXECUTION_FAILED',
          message: error instanceof Error ? error.message : String(error),
          recoverable: true,
        },
      };
    }
  }

  /**
   * Run a command and capture output.
   */
  private runCommand(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const shell = this.options.usePowerShell ? 'powershell.exe' : '/bin/bash';
      const shellArgs = this.options.usePowerShell ? ['-Command', command] : ['-c', command];

      const proc = spawn(shell, shellArgs, {
        cwd: this.options.cwd,
        timeout: this.options.timeout,
        env: process.env,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 0,
        });
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }
}

/**
 * Create a new Bash extension instance.
 */
export function createBashExtension(options?: BashExtensionOptions): BashExtension {
  return new BashExtension(options);
}
