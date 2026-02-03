#!/usr/bin/env node
/**
 * Ralph Protocol v3 - Global Agent Scaffold System
 * "Files are state, memory is cache"
 * 
 * A text-based operating system for LLM agents with:
 * - Command whitelisting and safety checks
 * - Robust context extraction
 * - 3-strike failure policy with auto-reset
 * - Token rot prevention via trimming and archiving
 * - Human intervention brake
 * - Persistent loop with subagent spawning
 */

import { Command } from "commander";
import { existsSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, copyFileSync, unlinkSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const program = new Command();

// ============================================================================
// CONFIGURATION
// ============================================================================

const COMMAND_WHITELIST = [
  "git", "make", "npm", "npx", "pnpm", "yarn", "bun",
  "python", "python3", "pip", "pip3", "uv", "poetry",
  "ls", "cat", "echo", "grep", "head", "tail", "touch", "mkdir", "cp", "mv", "pwd", "cd",
  "node", "tsc", "jest", "vitest", "pytest", "cargo", "go", "dotnet", "java", "mvn", "gradle",
  "docker", "kubectl", "terraform", "az", "aws", "gcloud",
  "curl", "wget", "jq", "yq", "sed", "awk", "find", "xargs", "sort", "uniq", "wc",
  "code", "claude", "copilot"
];

const DANGEROUS_PATTERNS = [
  /--force/i,
  /--hard/i,
  /\brm\s+-rf/i,
  /\brm\s.*\*/,
  />\s*\/dev\//,
  /\|\s*bash/,
  /\|\s*sh/,
  /eval\s/,
  /\$\(/,
  /`.*`/,
  /&&\s*rm/,
  /;\s*rm/,
  /format\s+c:/i,
  /del\s+\/[sq]/i,
  /drop\s+database/i,
  /truncate\s+table/i,
  />\s*\/etc\//,
  /chmod\s+777/,
  /curl.*\|\s*sudo/
];

// Failure detection patterns (agent is stuck/looping)
const FAILURE_PATTERNS = [
  /I cannot/i,
  /unable to/i,
  /need more context/i,
  /looping/i,
  /repeating/i,
  /I don't have access/i,
  /missing information/i,
  /cannot proceed/i,
  /stuck/i,
  /same error/i
];

const MAX_CONFUCIUS_LINES = 200;
const MAX_STRIKES = 3;
const COMMAND_TIMEOUT_MS = 60000;
const PROGRESS_TAIL_LINES = 50;

// ============================================================================
// FILE TEMPLATES
// ============================================================================

const TEMPLATES = {
  "IDEA.md": `# Project Idea

## Problem
[One paragraph describing the problem you are solving]

## User
[Who experiences this problem? What is their context?]

## Outcome
[What does success look like? What is the measurable result?]
`,

  "PRD.md": `# Product Requirements Document

## Scope
[What is included in this project]

## Non-Goals
- [What this project will NOT do]
- [Scope boundaries]

## User Stories
1. As a [user], I want to [action], so that [outcome]
2. As a [user], I want to [action], so that [outcome]

## Success Metrics
- [ ] Metric 1: [measurable outcome]
- [ ] Metric 2: [measurable outcome]

## Constraints
- Technical: [stack, APIs, dependencies]
- Timeline: [deadlines]
- Resources: [team, budget]

## Milestones
1. [ ] Milestone 1: [description] - [date]
2. [ ] Milestone 2: [description] - [date]
`,

  "tasks.md": `# Task Management

## Current Task
[No task assigned yet]

## Backlog
- [ ] Task 1: [description]
- [ ] Task 2: [description]

## In Progress
[None]

## Completed
- [x] Project initialized
`,

  "progress.txt": `# Progress Log
# Format: DATETIME | TASK | ACTION | RESULT | NEXT | FILES/COMMITS

${new Date().toISOString()} | INIT | Created project scaffold | Success | Define IDEA.md | PRD.md, tasks.md, confucius.md
`,

  "confucius.md": `# Confucius State Document
> "Files are state, memory is cache"
> Target: Under ${MAX_CONFUCIUS_LINES} lines

## North Star
[One sentence on the ultimate goal]

## Current State
- What works: [list]
- What fails: [list]
- What you learned: [list]

## Current Task
[One sentence describing the immediate next step]

## Constraints
- Stack: [languages, frameworks]
- APIs: [external dependencies]
- Environment: [requirements]

## Decisions
1. [Decision made and why]

## Open Questions
- [ ] [Only blockers go here]

## Next Steps
1. [Step 1]
2. [Step 2]
3. [Step 3 max]
`,

  "PROMPT.md": `# Agent Operating Instructions

You are Ralph, a build loop agent.

## Rules
1. Read PRD.md, progress.txt, confucius.md, tasks.md before doing work.
2. Do the next smallest step toward the current task.
3. If you change code, you must also update progress.txt and confucius.md.
4. You must give a run command and a verification step.
5. You must stop and ask for missing inputs if you cannot run or verify.

## Output Format
Every response MUST include:

\`\`\`
A. Plan: 3 steps max
   1. [Step 1]
   2. [Step 2]
   3. [Step 3]

B. Changes: list files changed
   - [file1]: [what changed]
   - [file2]: [what changed]

C. Commands: exact commands to run
   \`\`\`bash
   [command here]
   \`\`\`

D. Verification: what output proves success
   - Expected: [output]
   - If fail: [what to check]

E. Updates: append-ready text for progress.txt and confucius.md

   progress.txt:
   DATETIME | TASK | ACTION | RESULT | NEXT | FILES

   confucius.md Current State:
   - What works: [update]
   - What fails: [update]
\`\`\`

## Failure Definition
You have FAILED if any of these are true:
- Your output does not compile or run
- You repeat yourself without new evidence
- You ignore constraints in PRD.md
- You produce changes without updating progress.txt and confucius.md

## 3-Strike Rule
- Strike 1: Ask for a fix plan with a single smallest change
- Strike 2: Force a diagnosis step (reproduce, isolate, add tests)
- Strike 3: Hard reset (new subagent with only PRD + confucius + error)

## Current Task
Follow tasks.md. If tasks.md has no Current task, propose one.

## Available Commands
git, npm, npx, python, pip, node, tsc, jest, pytest, cargo, go, dotnet,
make, docker, kubectl, terraform, curl, jq, cat, ls, mkdir, touch, cp, mv

## Forbidden
- rm -rf, --force, --hard
- Piping to bash/sh
- eval, $(), backticks
- Anything not in whitelist
`
};

// ============================================================================
// SAFETY FUNCTIONS
// ============================================================================

function isCommandSafe(cmd: string): { safe: boolean; reason?: string } {
  const trimmed = cmd.trim();
  
  // Extract the base command
  const baseCmd = trimmed.split(/\s+/)[0];
  
  // Check whitelist
  if (!COMMAND_WHITELIST.some(allowed => baseCmd === allowed || baseCmd.endsWith(`/${allowed}`))) {
    return { safe: false, reason: `Command '${baseCmd}' not in whitelist` };
  }
  
  // Check dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { safe: false, reason: `Matches dangerous pattern: ${pattern}` };
    }
  }
  
  return { safe: true };
}

function executeCommand(cmd: string, cwd: string, logFile: string): { success: boolean; output: string } {
  const safety = isCommandSafe(cmd);
  
  if (!safety.safe) {
    const msg = `BLOCKED: ${cmd}\nReason: ${safety.reason}`;
    appendFileSync(logFile, `\n[BLOCKED] ${new Date().toISOString()}\n${msg}\n`);
    return { success: false, output: msg };
  }
  
  try {
    appendFileSync(logFile, `\n[EXEC] ${new Date().toISOString()}\n$ ${cmd}\n`);
    
    const output = execSync(cmd, {
      cwd,
      timeout: COMMAND_TIMEOUT_MS,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    
    appendFileSync(logFile, output + "\n");
    return { success: true, output };
  } catch (err: any) {
    const errorMsg = err.stderr || err.message || "Unknown error";
    appendFileSync(logFile, `[ERROR] ${errorMsg}\n`);
    return { success: false, output: errorMsg };
  }
}

// ============================================================================
// STRIKE SYSTEM - 3-Strike Failure Policy
// ============================================================================

interface StrikeState {
  runId: number;
  strikes: number;
  lastIssue: string;
  history: Array<{ timestamp: string; issue: string; action: string }>;
}

function getStrikeState(projectDir: string): StrikeState {
  const stateFile = join(projectDir, ".ralph", "strikes.json");
  if (existsSync(stateFile)) {
    try {
      return JSON.parse(readFileSync(stateFile, "utf-8"));
    } catch {
      // Corrupted, start fresh
    }
  }
  return { runId: 1, strikes: 0, lastIssue: "", history: [] };
}

function saveStrikeState(projectDir: string, state: StrikeState): void {
  const stateFile = join(projectDir, ".ralph", "strikes.json");
  mkdirSync(join(projectDir, ".ralph"), { recursive: true });
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

function recordStrike(projectDir: string, issue: string): StrikeState {
  const state = getStrikeState(projectDir);
  state.strikes++;
  state.lastIssue = issue;
  state.history.push({
    timestamp: new Date().toISOString(),
    issue,
    action: `Strike ${state.strikes}/${MAX_STRIKES}`
  });
  
  // Log to progress.txt
  const progressPath = join(projectDir, "progress.txt");
  if (existsSync(progressPath)) {
    const entry = `\n${new Date().toISOString()} | STRIKE | ${issue} | Strike ${state.strikes}/${MAX_STRIKES} | ${state.strikes >= MAX_STRIKES ? "RESET NEEDED" : "Retry"} | .ralph/strikes.json`;
    appendFileSync(progressPath, entry);
  }
  
  saveStrikeState(projectDir, state);
  return state;
}

function clearStrikes(projectDir: string): void {
  const state = getStrikeState(projectDir);
  state.strikes = 0;
  state.lastIssue = "";
  saveStrikeState(projectDir, state);
}

function hardReset(projectDir: string): StrikeState {
  const state = getStrikeState(projectDir);
  state.runId++;
  state.strikes = 0;
  state.lastIssue = "";
  state.history.push({
    timestamp: new Date().toISOString(),
    issue: "HARD RESET",
    action: `New run_id=${state.runId}`
  });
  
  // Log to progress.txt
  const progressPath = join(projectDir, "progress.txt");
  if (existsSync(progressPath)) {
    const entry = `\n${new Date().toISOString()} | RESET | Hard reset triggered | run_id=${state.runId} | Fresh context | .ralph/strikes.json`;
    appendFileSync(progressPath, entry);
  }
  
  // Archive current logs
  const logsDir = join(projectDir, ".ralph", "logs");
  const archiveDir = join(projectDir, ".ralph", "archive");
  mkdirSync(archiveDir, { recursive: true });
  
  if (existsSync(logsDir)) {
    const logFiles = readdirSync(logsDir).filter(f => f.endsWith(".log"));
    for (const logFile of logFiles) {
      const src = join(logsDir, logFile);
      const dst = join(archiveDir, `run${state.runId - 1}_${logFile}`);
      try {
        copyFileSync(src, dst);
        unlinkSync(src);
      } catch {}
    }
  }
  
  saveStrikeState(projectDir, state);
  return state;
}

function detectFailure(output: string): { failed: boolean; reason?: string } {
  for (const pattern of FAILURE_PATTERNS) {
    if (pattern.test(output)) {
      const match = output.match(pattern);
      return { failed: true, reason: match ? match[0] : "Pattern match" };
    }
  }
  return { failed: false };
}

// ============================================================================
// CONTEXT EXTRACTION (Robust AWK-style parsing)
// ============================================================================

function extractCurrentTask(tasksContent: string): string {
  const lines = tasksContent.split("\n");
  let inCurrentTask = false;
  
  for (const line of lines) {
    if (line.includes("## Current Task")) {
      inCurrentTask = true;
      continue;
    }
    if (inCurrentTask && line.startsWith("##")) {
      break;
    }
    if (inCurrentTask && line.trim().length > 0) {
      return line.trim();
    }
  }
  
  return "[No task assigned]";
}

function buildContext(projectDir: string): string {
  const files = ["IDEA.md", "PRD.md", "tasks.md", "progress.txt", "confucius.md", "PROMPT.md"];
  let context = "";
  
  for (const file of files) {
    const filePath = join(projectDir, file);
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, "utf-8");
      
      if (file === "progress.txt") {
        // Only last N lines to prevent token rot
        const lines = content.split("\n");
        context += `\n--- ${file} (last ${PROGRESS_TAIL_LINES} lines) ---\n`;
        context += lines.slice(-PROGRESS_TAIL_LINES).join("\n");
      } else if (file === "tasks.md") {
        context += `\n--- ${file} ---\n`;
        context += content;
        context += `\n\n>>> Current Task: ${extractCurrentTask(content)}`;
      } else {
        context += `\n--- ${file} ---\n`;
        context += content;
      }
      context += "\n";
    }
  }
  
  // Add strike status
  const state = getStrikeState(projectDir);
  context += `\n--- Strike Status ---\n`;
  context += `Run ID: ${state.runId}\n`;
  context += `Strikes: ${state.strikes}/${MAX_STRIKES}\n`;
  if (state.lastIssue) {
    context += `Last Issue: ${state.lastIssue}\n`;
  }
  
  return context;
}

/**
 * Build minimal context for subagent spawn (after hard reset)
 * Only includes: PRD.md, confucius.md, exact error, touched file tree
 */
function buildSubagentContext(projectDir: string, error?: string): string {
  let context = "# Subagent Context (Fresh Start)\n\n";
  
  // PRD.md (full)
  const prdPath = join(projectDir, "PRD.md");
  if (existsSync(prdPath)) {
    context += "--- PRD.md ---\n";
    context += readFileSync(prdPath, "utf-8");
    context += "\n\n";
  }
  
  // confucius.md (full)
  const confuciusPath = join(projectDir, "confucius.md");
  if (existsSync(confuciusPath)) {
    context += "--- confucius.md ---\n";
    context += readFileSync(confuciusPath, "utf-8");
    context += "\n\n";
  }
  
  // Error output (if provided)
  if (error) {
    context += "--- Failing Error ---\n";
    context += error;
    context += "\n\n";
  }
  
  // File tree of touched files (from git status)
  try {
    const gitStatus = execSync("git status --porcelain", { cwd: projectDir, encoding: "utf-8" });
    if (gitStatus.trim()) {
      context += "--- Touched Files ---\n";
      context += gitStatus;
      context += "\n";
    }
  } catch {}
  
  context += "\n--- Instructions ---\n";
  context += "You are a fresh subagent. The previous agent failed after 3 strikes.\n";
  context += "Read the PRD and confucius.md carefully. Start from first principles.\n";
  context += "Do NOT repeat the same approach that caused the error above.\n";
  
  return context;
}

// ============================================================================
// CONFUCIUS TRIMMING (Structure-preserving)
// ============================================================================

function trimConfucius(projectDir: string): void {
  const confuciusPath = join(projectDir, "confucius.md");
  const archiveDir = join(projectDir, ".ralph", "archive");
  
  if (!existsSync(confuciusPath)) return;
  
  const content = readFileSync(confuciusPath, "utf-8");
  const lines = content.split("\n");
  
  if (lines.length <= MAX_CONFUCIUS_LINES) return;
  
  // Archive old version
  mkdirSync(archiveDir, { recursive: true });
  const archivePath = join(archiveDir, `confucius_${Date.now()}.md`);
  copyFileSync(confuciusPath, archivePath);
  
  // Preserve structure
  const sections: Record<string, string[]> = {};
  let currentSection = "header";
  sections[currentSection] = [];
  
  for (const line of lines) {
    if (line.startsWith("## ")) {
      currentSection = line;
      sections[currentSection] = [];
    } else {
      sections[currentSection].push(line);
    }
  }
  
  // Rebuild with trimmed content
  let newContent = "";
  
  // Keep header (first 10 lines of header section)
  newContent += sections["header"].slice(0, 10).join("\n") + "\n";
  
  // Keep important sections fully
  const importantSections = ["## North Star", "## Current State", "## Decisions Made", "## Open Questions"];
  for (const section of importantSections) {
    if (sections[section]) {
      newContent += `\n${section}\n`;
      newContent += sections[section].slice(-20).join("\n") + "\n";
    }
  }
  
  // Trim learnings to last 10
  if (sections["## Learnings"]) {
    newContent += "\n## Learnings\n";
    newContent += sections["## Learnings"].slice(-10).join("\n") + "\n";
  }
  
  writeFileSync(confuciusPath, newContent);
  console.log(`Trimmed confucius.md (archived to ${archivePath})`);
}

// ============================================================================
// PAUSE/RESUME MECHANISM
// ============================================================================

function isPaused(projectDir: string): boolean {
  return existsSync(join(projectDir, ".ralph", "PAUSE"));
}

function pause(projectDir: string): void {
  const pauseFile = join(projectDir, ".ralph", "PAUSE");
  writeFileSync(pauseFile, `Paused at ${new Date().toISOString()}\n`);
  console.log("Agent PAUSED. Remove .ralph/PAUSE to continue.");
}

function resume(projectDir: string): void {
  const pauseFile = join(projectDir, ".ralph", "PAUSE");
  if (existsSync(pauseFile)) {
    unlinkSync(pauseFile);
    console.log("Agent RESUMED.");
  }
}

// ============================================================================
// CLI COMMANDS
// ============================================================================

program
  .name("ralph")
  .description("Ralph Protocol v3 - Global Agent Scaffold System with 3-Strike Reset")
  .version("0.2.0");

program
  .command("init")
  .description("Initialize Ralph Protocol in current directory")
  .option("--name <name>", "Project name")
  .option("--vision <vision>", "Project vision statement")
  .option("--idea <idea>", "One-line problem statement")
  .action((opts) => {
    const projectDir = process.cwd();
    const ralphDir = join(projectDir, ".ralph");
    const archiveDir = join(ralphDir, "archive");
    const logsDir = join(ralphDir, "logs");
    
    // Create directories
    mkdirSync(ralphDir, { recursive: true });
    mkdirSync(archiveDir, { recursive: true });
    mkdirSync(logsDir, { recursive: true });
    
    // Initialize strike state
    const initialState: StrikeState = {
      runId: 1,
      strikes: 0,
      lastIssue: "",
      history: [{
        timestamp: new Date().toISOString(),
        issue: "INIT",
        action: "Project initialized"
      }]
    };
    saveStrikeState(projectDir, initialState);
    
    // Create template files
    for (const [filename, content] of Object.entries(TEMPLATES)) {
      const filePath = join(projectDir, filename);
      if (!existsSync(filePath)) {
        let fileContent = content;
        if (opts.name) {
          fileContent = fileContent.replace("[Describe the project vision here]", opts.name);
          fileContent = fileContent.replace("[One sentence on the ultimate goal]", opts.name);
        }
        if (opts.vision) {
          fileContent = fileContent.replace("[The ultimate goal of this project]", opts.vision);
        }
        if (opts.idea) {
          fileContent = fileContent.replace("[One paragraph describing the problem you are solving]", opts.idea);
        }
        writeFileSync(filePath, fileContent);
        console.log(`Created: ${filename}`);
      } else {
        console.log(`Skipped (exists): ${filename}`);
      }
    }
    
    // Create .gitignore entries
    const gitignorePath = join(projectDir, ".gitignore");
    const gitignoreEntries = "\n# Ralph Protocol\n.ralph/logs/\n.ralph/PAUSE\n.ralph/strikes.json\n";
    if (existsSync(gitignorePath)) {
      const existing = readFileSync(gitignorePath, "utf-8");
      if (!existing.includes(".ralph/")) {
        appendFileSync(gitignorePath, gitignoreEntries);
      }
    } else {
      writeFileSync(gitignorePath, gitignoreEntries);
    }
    
    console.log("\n✓ Ralph Protocol v3 initialized!");
    console.log("\nFile structure:");
    console.log("  IDEA.md      - Problem, User, Outcome");
    console.log("  PRD.md       - Scope, Non-goals, User stories, Metrics");
    console.log("  tasks.md     - Current task and backlog");
    console.log("  progress.txt - Append-only log (datetime | task | action | result)");
    console.log("  confucius.md - State document (<200 lines)");
    console.log("  PROMPT.md    - Agent operating instructions");
    console.log("\nNext steps:");
    console.log("  1. ralph idea   - Edit IDEA.md interactively");
    console.log("  2. ralph task   - Set the current task");
    console.log("  3. ralph loop   - Start the agent loop");
    console.log("  4. ralph status - Check strike count and state");
  });

program
  .command("context")
  .description("Show the current agent context")
  .action(() => {
    const projectDir = process.cwd();
    const context = buildContext(projectDir);
    console.log(context);
  });

program
  .command("task <description>")
  .description("Set the current task")
  .action((description) => {
    const projectDir = process.cwd();
    const tasksPath = join(projectDir, "tasks.md");
    
    if (!existsSync(tasksPath)) {
      console.error("No tasks.md found. Run 'ralph init' first.");
      process.exit(1);
    }
    
    let content = readFileSync(tasksPath, "utf-8");
    content = content.replace(
      /## Current Task\n.*/,
      `## Current Task\n${description}`
    );
    writeFileSync(tasksPath, content);
    
    // Log to progress
    const progressPath = join(projectDir, "progress.txt");
    appendFileSync(progressPath, `\n[TASK] -> Set current task -> ${description}`);
    
    console.log(`✓ Current task set to: ${description}`);
  });

program
  .command("run <command...>")
  .description("Execute a command with safety checks")
  .action((commandParts) => {
    const projectDir = process.cwd();
    const logsDir = join(projectDir, ".ralph", "logs");
    const logFile = join(logsDir, `run_${Date.now()}.log`);
    
    mkdirSync(logsDir, { recursive: true });
    
    const cmd = commandParts.join(" ");
    console.log(`Executing: ${cmd}`);
    
    const result = executeCommand(cmd, projectDir, logFile);
    
    if (result.success) {
      console.log(result.output);
    } else {
      console.error(`Failed: ${result.output}`);
      process.exit(1);
    }
  });

program
  .command("progress <message>")
  .description("Append to progress.txt")
  .option("--task <task>", "Task name", "MANUAL")
  .option("--action <action>", "Action taken", "Update")
  .action((message, opts) => {
    const projectDir = process.cwd();
    const progressPath = join(projectDir, "progress.txt");
    
    const entry = `\n[${opts.task}] -> ${opts.action} -> ${message}`;
    appendFileSync(progressPath, entry);
    console.log(`✓ Logged: ${entry.trim()}`);
  });

program
  .command("trim")
  .description("Trim confucius.md to prevent context overflow")
  .action(() => {
    const projectDir = process.cwd();
    trimConfucius(projectDir);
    console.log("✓ Trimmed confucius.md");
  });

program
  .command("pause")
  .description("Pause agent execution")
  .action(() => {
    pause(process.cwd());
  });

program
  .command("resume")
  .description("Resume agent execution")
  .action(() => {
    resume(process.cwd());
  });

program
  .command("status")
  .description("Show Ralph Protocol status including strike count")
  .action(() => {
    const projectDir = process.cwd();
    const ralphDir = join(projectDir, ".ralph");
    
    console.log("\n=== Ralph Protocol v3 Status ===\n");
    
    // Check initialization
    if (!existsSync(ralphDir)) {
      console.log("❌ Not initialized (run 'ralph init')");
      return;
    }
    console.log("✓ Initialized");
    
    // Check required files
    const requiredFiles = ["IDEA.md", "PRD.md", "tasks.md", "progress.txt", "confucius.md", "PROMPT.md"];
    for (const file of requiredFiles) {
      const exists = existsSync(join(projectDir, file));
      console.log(`${exists ? "✓" : "❌"} ${file}`);
    }
    
    // Strike status
    const state = getStrikeState(projectDir);
    console.log("\n--- Strike System ---");
    console.log(`Run ID: ${state.runId}`);
    console.log(`Strikes: ${state.strikes}/${MAX_STRIKES} ${state.strikes >= MAX_STRIKES ? "⚠️ RESET NEEDED" : ""}`);
    if (state.lastIssue) {
      console.log(`Last Issue: ${state.lastIssue}`);
    }
    
    // Strike visualization
    const strikeBar = "🔴".repeat(state.strikes) + "⚪".repeat(MAX_STRIKES - state.strikes);
    console.log(`Strike Bar: ${strikeBar}`);
    
    // Check pause status
    if (isPaused(projectDir)) {
      console.log("\n⏸️  PAUSED (run 'ralph resume' to continue)");
    } else {
      console.log("\n▶️  ACTIVE");
    }
    
    // Show current task
    const tasksPath = join(projectDir, "tasks.md");
    if (existsSync(tasksPath)) {
      const tasksContent = readFileSync(tasksPath, "utf-8");
      console.log(`\nCurrent Task: ${extractCurrentTask(tasksContent)}`);
    }
    
    // Show confucius size
    const confuciusPath = join(projectDir, "confucius.md");
    if (existsSync(confuciusPath)) {
      const lines = readFileSync(confuciusPath, "utf-8").split("\n").length;
      const percentage = Math.round((lines / MAX_CONFUCIUS_LINES) * 100);
      console.log(`\nToken Health: confucius.md ${lines}/${MAX_CONFUCIUS_LINES} lines (${percentage}%)`);
      if (lines > MAX_CONFUCIUS_LINES * 0.8) {
        console.log("⚠️  Consider running 'ralph trim'");
      }
    }
    
    // Show recent history
    if (state.history.length > 0) {
      console.log("\n--- Recent History (last 5) ---");
      const recentHistory = state.history.slice(-5);
      for (const entry of recentHistory) {
        console.log(`  ${entry.timestamp.substring(0, 19)} | ${entry.action}`);
      }
    }
  });

program
  .command("strike [reason]")
  .description("Record a strike (agent failed)")
  .action((reason) => {
    const projectDir = process.cwd();
    const issue = reason || "Manual strike recorded";
    const state = recordStrike(projectDir, issue);
    
    console.log(`\n🔴 Strike ${state.strikes}/${MAX_STRIKES} recorded`);
    console.log(`Reason: ${issue}`);
    
    if (state.strikes >= MAX_STRIKES) {
      console.log("\n⚠️  MAX STRIKES REACHED!");
      console.log("Run 'ralph reset' to spawn fresh subagent context.");
    } else if (state.strikes === 2) {
      console.log("\n⚠️  Strike 2: Force diagnosis step");
      console.log("   1. Reproduce the error");
      console.log("   2. Isolate the cause");
      console.log("   3. Add a test");
    } else if (state.strikes === 1) {
      console.log("\n⚠️  Strike 1: Ask for single smallest change");
    }
  });

program
  .command("unstrike")
  .description("Clear all strikes (success)")
  .action(() => {
    const projectDir = process.cwd();
    clearStrikes(projectDir);
    console.log("✓ All strikes cleared");
  });

program
  .command("reset")
  .description("Hard reset - new run ID, clear strikes, archive logs")
  .option("--error <error>", "The error that caused the reset")
  .action((opts) => {
    const projectDir = process.cwd();
    const state = hardReset(projectDir);
    
    console.log("\n🔄 HARD RESET");
    console.log(`New Run ID: ${state.runId}`);
    console.log("Strikes: 0/3");
    console.log("Logs archived.");
    
    // Generate subagent context
    const subagentContext = buildSubagentContext(projectDir, opts.error);
    const contextFile = join(projectDir, ".ralph", "subagent_context.md");
    writeFileSync(contextFile, subagentContext);
    
    console.log(`\nSubagent context written to: .ralph/subagent_context.md`);
    console.log("\nTo spawn new agent, paste contents of subagent_context.md");
    console.log("into a fresh chat window. Do NOT paste old chat history.");
  });

program
  .command("subagent")
  .description("Generate minimal context for fresh subagent")
  .option("--error <error>", "The failing error message")
  .option("--output <file>", "Output file (default: stdout)")
  .action((opts) => {
    const projectDir = process.cwd();
    const context = buildSubagentContext(projectDir, opts.error);
    
    if (opts.output) {
      writeFileSync(opts.output, context);
      console.log(`Subagent context written to: ${opts.output}`);
    } else {
      console.log(context);
    }
  });

program
  .command("check <output>")
  .description("Check agent output for failure patterns")
  .action((output) => {
    const result = detectFailure(output);
    if (result.failed) {
      console.log(`⚠️  FAILURE DETECTED: ${result.reason}`);
      console.log("Consider running 'ralph strike' to record this failure.");
    } else {
      console.log("✓ No failure patterns detected");
    }
  });

program
  .command("commit")
  .description("Checkpoint: git add, commit, and verify state files updated")
  .option("-m, --message <msg>", "Commit message")
  .action((opts) => {
    const projectDir = process.cwd();
    const logsDir = join(projectDir, ".ralph", "logs");
    const logFile = join(logsDir, `commit_${Date.now()}.log`);
    mkdirSync(logsDir, { recursive: true });
    
    // Check that state files were updated
    const stateFiles = ["progress.txt", "confucius.md"];
    const gitStatus = execSync("git status --porcelain", { cwd: projectDir, encoding: "utf-8" });
    
    const missingUpdates: string[] = [];
    for (const file of stateFiles) {
      if (!gitStatus.includes(file)) {
        missingUpdates.push(file);
      }
    }
    
    if (missingUpdates.length > 0) {
      console.log("⚠️  State files not updated:");
      for (const file of missingUpdates) {
        console.log(`   - ${file}`);
      }
      console.log("\nRule: Every commit must update progress.txt and confucius.md");
      console.log("Recording strike for missing state updates...");
      recordStrike(projectDir, `Missing state updates: ${missingUpdates.join(", ")}`);
      process.exit(1);
    }
    
    // Proceed with commit
    const message = opts.message || `Ralph: Checkpoint at ${new Date().toISOString()}`;
    
    const addResult = executeCommand("git add -A", projectDir, logFile);
    if (!addResult.success) {
      console.error("Failed to stage files");
      process.exit(1);
    }
    
    const commitResult = executeCommand(`git commit -m "${message}"`, projectDir, logFile);
    if (!commitResult.success) {
      console.error("Failed to commit");
      process.exit(1);
    }
    
    // Clear strikes on successful commit
    clearStrikes(projectDir);
    
    console.log("✓ Committed and strikes cleared");
    console.log(commitResult.output);
  });

program
  .command("archive")
  .description("List archived files (confucius, logs)")
  .action(() => {
    const archiveDir = join(process.cwd(), ".ralph", "archive");
    
    if (!existsSync(archiveDir)) {
      console.log("No archives found.");
      return;
    }
    
    const files = readdirSync(archiveDir);
    if (files.length === 0) {
      console.log("No archives found.");
      return;
    }
    
    console.log("\n=== Archives ===\n");
    
    const confuciusFiles = files.filter(f => f.startsWith("confucius_"));
    const logFiles = files.filter(f => f.endsWith(".log"));
    
    if (confuciusFiles.length > 0) {
      console.log("Confucius snapshots:");
      for (const file of confuciusFiles.sort().reverse().slice(0, 10)) {
        const timestamp = file.replace("confucius_", "").replace(".md", "");
        const date = new Date(parseInt(timestamp));
        console.log(`  ${file} (${date.toLocaleString()})`);
      }
    }
    
    if (logFiles.length > 0) {
      console.log("\nRun logs:");
      for (const file of logFiles.sort().reverse().slice(0, 10)) {
        const filePath = join(archiveDir, file);
        const stats = statSync(filePath);
        console.log(`  ${file} (${Math.round(stats.size / 1024)}KB)`);
      }
    }
  });

program
  .command("validate <command>")
  .description("Check if a command is safe to execute")
  .action((command) => {
    const result = isCommandSafe(command);
    if (result.safe) {
      console.log(`✓ SAFE: ${command}`);
    } else {
      console.log(`✗ BLOCKED: ${command}`);
      console.log(`  Reason: ${result.reason}`);
    }
  });

program
  .command("loop")
  .description("Generate loop script for continuous agent execution")
  .option("--agent <cmd>", "Agent command (default: claude-code)", "claude-code")
  .option("--bash", "Output bash script")
  .option("--powershell", "Output PowerShell script")
  .action((opts) => {
    const agentCmd = opts.agent;
    
    if (opts.powershell || process.platform === "win32" && !opts.bash) {
      // PowerShell script
      const psScript = `# Ralph Loop - PowerShell
# Usage: .\\ralph-loop.ps1

$AGENT_CMD = "${agentCmd}"
$MAX_STRIKES = ${MAX_STRIKES}
$SESSION_DIR = ".ralph"

New-Item -ItemType Directory -Force -Path $SESSION_DIR | Out-Null

$strikeFile = Join-Path $SESSION_DIR "strikes_ps.txt"
$logFile = Join-Path $SESSION_DIR "run_ps.log"
$runIdFile = Join-Path $SESSION_DIR "run_id_ps.txt"

function Get-Strikes {
    if (Test-Path $strikeFile) { [int](Get-Content $strikeFile) } else { 0 }
}

function Get-RunId {
    if (Test-Path $runIdFile) { [int](Get-Content $runIdFile) } else { 0 }
}

function Reset-Agent {
    $runId = (Get-RunId) + 1
    Set-Content -Path $runIdFile -Value $runId
    Set-Content -Path $strikeFile -Value 0
    Add-Content -Path $logFile -Value ""
    Add-Content -Path $logFile -Value "RESET run_id=$runId"
    return $runId
}

function Invoke-AgentOnce {
    param($runId)
    Add-Content -Path $logFile -Value "RUN run_id=$runId"
    $context = @(
        (Get-Content PRD.md -Raw -ErrorAction SilentlyContinue),
        (Get-Content confucius.md -Raw -ErrorAction SilentlyContinue),
        (Get-Content tasks.md -Raw -ErrorAction SilentlyContinue),
        (Get-Content progress.txt -Raw -ErrorAction SilentlyContinue),
        (Get-Content PROMPT.md -Raw -ErrorAction SilentlyContinue)
    ) -join "\\n---\\n"
    
    $output = $context | & $AGENT_CMD 2>&1 | Tee-Object -Append -FilePath $logFile
    return $output
}

$runId = Reset-Agent
$strikes = 0

while ($true) {
    if (Test-Path (Join-Path $SESSION_DIR "PAUSE")) {
        Write-Host "PAUSED - Remove .ralph/PAUSE to continue"
        Start-Sleep -Seconds 5
        continue
    }
    
    $output = Invoke-AgentOnce -runId $runId
    
    # Check for failure patterns
    if ($output -match "I cannot|unable to|need more context|looping|repeating") {
        $strikes++
        Set-Content -Path $strikeFile -Value $strikes
        Add-Content -Path $logFile -Value "STRIKE $strikes run_id=$runId"
        Write-Host "STRIKE $strikes/$MAX_STRIKES"
        
        if ($strikes -ge $MAX_STRIKES) {
            Write-Host "MAX STRIKES - Resetting agent..."
            $runId = Reset-Agent
            $strikes = 0
        }
    } else {
        Set-Content -Path $strikeFile -Value 0
        $strikes = 0
    }
}
`;
      console.log(psScript);
      
      // Also write to file
      const scriptPath = join(process.cwd(), "ralph-loop.ps1");
      writeFileSync(scriptPath, psScript);
      console.log(`\n✓ Written to: ralph-loop.ps1`);
      console.log(`Run with: .\\ralph-loop.ps1`);
      
    } else {
      // Bash script
      const bashScript = `#!/usr/bin/env bash
# Ralph Loop - Bash
# Usage: ./ralph-loop.sh

set -euo pipefail

AGENT_CMD="\${AGENT_CMD:-${agentCmd}}"
MAX_STRIKES="\${MAX_STRIKES:-${MAX_STRIKES}}"
SESSION_DIR=".ralph"
mkdir -p "$SESSION_DIR"

strike_file="$SESSION_DIR/strikes.txt"
log_file="$SESSION_DIR/run.log"
run_id_file="$SESSION_DIR/run_id.txt"

strikes="$(cat "$strike_file" 2>/dev/null || echo 0)"
run_id="$(cat "$run_id_file" 2>/dev/null || echo 0)"

reset_agent() {
  run_id=$((run_id + 1))
  echo "$run_id" > "$run_id_file"
  echo 0 > "$strike_file"
  echo "" >> "$log_file"
  echo "RESET run_id=$run_id" >> "$log_file"
}

run_agent_once() {
  echo "RUN run_id=$run_id" >> "$log_file"
  cat PRD.md confucius.md tasks.md progress.txt PROMPT.md 2>/dev/null | $AGENT_CMD | tee -a "$log_file"
}

reset_agent

while true; do
  # Check pause
  if [ -f "$SESSION_DIR/PAUSE" ]; then
    echo "PAUSED - Remove .ralph/PAUSE to continue"
    sleep 5
    continue
  fi

  output="$(run_agent_once)"
  
  # Check for failure patterns
  if echo "$output" | grep -qiE "I cannot|unable to|need more context|looping|repeating|stuck|same error"; then
    strikes=$((strikes + 1))
    echo "$strikes" > "$strike_file"
    echo "STRIKE $strikes run_id=$run_id" >> "$log_file"
    echo "STRIKE $strikes/$MAX_STRIKES"
    
    if [ "$strikes" -ge "$MAX_STRIKES" ]; then
      echo "MAX STRIKES - Resetting agent..."
      reset_agent
      strikes=0
    fi
  else
    echo 0 > "$strike_file"
    strikes=0
  fi
done
`;
      console.log(bashScript);
      
      // Also write to file
      const scriptPath = join(process.cwd(), "ralph-loop.sh");
      writeFileSync(scriptPath, bashScript, { mode: 0o755 });
      console.log(`\n✓ Written to: ralph-loop.sh`);
      console.log(`Run with: chmod +x ralph-loop.sh && ./ralph-loop.sh`);
    }
  });

program
  .command("idea")
  .description("Show or edit IDEA.md")
  .option("--problem <text>", "Set the problem statement")
  .option("--user <text>", "Set the user description")
  .option("--outcome <text>", "Set the outcome")
  .action((opts) => {
    const projectDir = process.cwd();
    const ideaPath = join(projectDir, "IDEA.md");
    
    if (!opts.problem && !opts.user && !opts.outcome) {
      // Just show current IDEA.md
      if (existsSync(ideaPath)) {
        console.log(readFileSync(ideaPath, "utf-8"));
      } else {
        console.log("No IDEA.md found. Run 'ralph init' first.");
      }
      return;
    }
    
    // Update IDEA.md
    let content = existsSync(ideaPath) ? readFileSync(ideaPath, "utf-8") : TEMPLATES["IDEA.md"];
    
    if (opts.problem) {
      content = content.replace(
        /## Problem\n\[.*?\]/s,
        `## Problem\n${opts.problem}`
      );
    }
    if (opts.user) {
      content = content.replace(
        /## User\n\[.*?\]/s,
        `## User\n${opts.user}`
      );
    }
    if (opts.outcome) {
      content = content.replace(
        /## Outcome\n\[.*?\]/s,
        `## Outcome\n${opts.outcome}`
      );
    }
    
    writeFileSync(ideaPath, content);
    console.log("✓ IDEA.md updated");
  });

program
  .command("history")
  .description("Show strike history")
  .option("--full", "Show full history")
  .action((opts) => {
    const projectDir = process.cwd();
    const state = getStrikeState(projectDir);
    
    console.log("\n=== Strike History ===\n");
    console.log(`Run ID: ${state.runId}`);
    console.log(`Current Strikes: ${state.strikes}/${MAX_STRIKES}`);
    
    if (state.history.length === 0) {
      console.log("\nNo history recorded.");
      return;
    }
    
    const entries = opts.full ? state.history : state.history.slice(-10);
    console.log(`\nShowing ${entries.length} of ${state.history.length} entries:\n`);
    
    for (const entry of entries) {
      console.log(`${entry.timestamp}`);
      console.log(`  Issue: ${entry.issue}`);
      console.log(`  Action: ${entry.action}`);
      console.log();
    }
  });

program.parse();
