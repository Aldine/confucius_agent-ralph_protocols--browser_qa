# @aldine/confucius-agent

> "Files are state, memory is cache"

**Confucius Agent** - A unified npm package combining Ralph Protocol v3 and Browser QA MCP Server for autonomous AI agent development.

[![npm version](https://img.shields.io/npm/v/@aldine/confucius-agent.svg)](https://www.npmjs.com/package/@aldine/confucius-agent)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 📦 What's Included

This package unifies two complementary tools:

### 🔄 Ralph Protocol v3
A text-based operating system for LLM agents with:
- **3-Strike Failure Policy**: Auto-reset after 3 failed attempts
- **Token Rot Prevention**: Hard cap on state files, automatic archiving
- **Loop Scripts**: Bash/PowerShell scripts for continuous agent execution
- **Subagent Spawning**: Fresh context generation for hard resets

### 🌐 Confucius Browser MCP
MCP server for browser automation and testing:
- **Visual QA**: Screenshot capture and comparison
- **Accessibility Testing**: WCAG contrast auditing
- **Console Monitoring**: Error and warning collection
- **Chrome DevTools Protocol**: Direct browser control

## 🚀 Quick Start

### Installation

```bash
# Global installation (recommended for CLI tools)
npm install -g @aldine/confucius-agent

# Local installation
npm install @aldine/confucius-agent
```

### Ralph Protocol - Initialize a Project

```bash
cd your-project
ralph init --name "My AI Project" --vision "Build something amazing"
```

This creates the Ralph scaffold:
```
your-project/
├── IDEA.md          # Problem, User, Outcome
├── PRD.md           # Scope, Non-goals, User Stories, Metrics
├── tasks.md         # Task management
├── progress.txt     # Append-only progress log
├── confucius.md     # State document (<200 lines)
├── PROMPT.md        # Agent operating instructions
└── .ralph/
    ├── archive/     # Archived state files
    ├── logs/        # Command execution logs
    └── strikes.json # Strike counter state
```

### Browser MCP - Initialize for VS Code Copilot

```bash
confucius-browser init --host vscode
```

Or for Claude Code:
```bash
confucius-browser init --host claude
```

## 📖 Ralph Protocol Commands

### Core Commands

```bash
ralph init                    # Initialize Ralph Protocol
ralph status                  # Show status, strikes, token health
ralph context                 # Display full agent context
ralph task "Build API"        # Set the current task
ralph progress "Fixed bug"    # Append to progress.txt
```

### Strike System

```bash
ralph strike "Agent looping"  # Record a strike (max 3)
ralph unstrike                # Clear all strikes on success
ralph reset --error "..."     # Hard reset: new run ID, fresh context
ralph history                 # View strike history
ralph check "agent output"    # Check output for failure patterns
```

**3-Strike Rule:**
- Strike 1: Ask for single smallest change
- Strike 2: Force diagnosis (reproduce → isolate → test)
- Strike 3: **Hard reset** - spawn fresh subagent

### Loop Execution

```bash
ralph loop --powershell       # Generate PowerShell loop script
ralph loop --bash             # Generate Bash loop script
ralph loop --agent "claude"   # Specify agent CLI command
```

### Subagent Spawning

```bash
ralph subagent                # Generate minimal context for fresh agent
ralph subagent --error "..."  # Include the failing error
ralph subagent --output ctx.md # Write to file
```

## 🌐 Browser MCP Tools

When configured with VS Code Copilot or Claude Code, these MCP tools become available:

### `open_url`
Navigate to URLs with configurable wait conditions.
```
"Navigate to http://localhost:3000 and wait for the page to load"
```

### `screenshot`
Capture full page or viewport screenshots.
```
"Take a screenshot of the login page"
```

### `console_errors`
Collect console messages, errors, and warnings.
```
"Check for console errors on the dashboard"
```

### `contrast_audit`
WCAG contrast checking for accessibility compliance.
```
"Audit the page for WCAG contrast violations"
```

## 🔧 Prerequisites

- **Node.js**: 18.18.0+
- **Google Chrome**: Latest stable (for Browser MCP)
- **Chrome Remote Debugging**: Launch with `--remote-debugging-port=9222`

## 🛡️ Security

The Browser MCP implements defense-in-depth security:
- **Localhost-only by default**: Only allows `http://localhost` and `http://127.0.0.1`
- **Approval tokens**: External URLs require explicit approval via `CONFUCIUS_APPROVAL_TOKEN`
- **Secrets redaction**: Automatically redacts sensitive data from logs
- **Chrome binding**: Requires Chrome to bind to 127.0.0.1 only

See [SECURITY.md](./SECURITY.md) for the full security policy.

## 🏗️ Architecture

```
@aldine/confucius-agent/
├── src/
│   ├── index.ts              # Main entry point
│   ├── ralph/                # Ralph Protocol v3
│   │   └── index.ts          # CLI & core logic
│   └── browser/              # Browser MCP Server
│       ├── index.ts          # CLI entry point
│       ├── public.ts         # Public API exports
│       ├── mcp/              # MCP protocol implementation
│       │   ├── server.ts     # Stdio server
│       │   └── logging.ts    # Structured logging
│       ├── runtime/          # Chrome DevTools integration
│       │   ├── cdp_client.ts # CDP client
│       │   ├── browser_session.ts
│       │   └── allowlist.ts  # URL security
│       └── cli/              # Config writers
├── ralph-loop.ps1            # PowerShell loop script
├── package.json
├── tsconfig.json
├── SECURITY.md
└── README.md
```

## 🎯 Use Cases

### Autonomous Agent Development
```bash
# Initialize project with Ralph scaffold
ralph init --name "AutoCoder" --vision "Self-improving code agent"

# Start development loop
ralph loop --powershell

# Agent works autonomously with automatic strike tracking
```

### Visual QA & Accessibility
```bash
# Set up Browser MCP
confucius-browser init --host vscode

# In Copilot/Claude:
"Navigate to localhost:3000 and check for WCAG contrast violations"
"Take screenshots of all form states"
"Check for console errors during checkout flow"
```

### Combined Workflow
Use Ralph Protocol to manage agent state while Browser MCP provides visual verification:
1. Agent reads PRD.md and tasks.md
2. Makes code changes
3. Browser MCP verifies UI changes
4. Ralph tracks progress and handles failures

## 📄 Migration from Previous Packages

If you were using the separate packages:

```bash
# Old packages (deprecated)
npm uninstall @aldine/ralph-protocol @aldine/confucius-mcp-browser

# New unified package
npm install -g @aldine/confucius-agent
```

The CLI commands remain the same:
- `ralph` - Ralph Protocol commands
- `confucius-browser` - Browser MCP commands

## 📝 License

MIT License - see [LICENSE](./LICENSE) for details.

## 🔗 Links

- **GitHub**: https://github.com/Aldine/confucius_agent-ralph_protocols--browser_qa
- **npm**: https://www.npmjs.com/package/@aldine/confucius-agent
- **Issues**: https://github.com/Aldine/confucius_agent-ralph_protocols--browser_qa/issues

## 🙏 Acknowledgments

Built with ❤️ for autonomous AI agent development, visual QA, and accessibility testing.

---

**Replaces:**
- `@aldine/ralph-protocol` (v0.2.0)
- `@aldine/confucius-mcp-browser` (v0.1.0)
