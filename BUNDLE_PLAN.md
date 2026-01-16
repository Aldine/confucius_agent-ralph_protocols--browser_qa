# Confucius Agent - Complete Bundle

This document describes the complete Confucius Agent ecosystem with Ralph Protocol v3, Browser MCP, and Subagent capabilities.

## 📦 Package Structure

### 1. Core NPM Package: `@aldine/confucius-agent`
**Repository**: https://github.com/Aldine/confucius_agent-ralph_protocols--browser_qa

**What's Included:**
- **Ralph Protocol v3** (TypeScript): Agent scaffold with 3-Strike Reset
- **Browser MCP Server** (TypeScript): Visual QA and accessibility testing
- **Unified Binary**: `ralph` CLI + `confucius-browser` CLI

**Install:**
```bash
npm install -g @aldine/confucius-agent
```

**Usage:**
```bash
# Ralph Protocol
ralph init --name "My Project"
ralph status
ralph strike "Agent looping"
ralph reset --error "..."

# Browser MCP
confucius-browser init --host vscode
confucius-browser doctor
```

---

### 2. Monorepo SDK: `confucius-vision-scaffolding-sdk`
**Repository**: https://github.com/Aldine/confucius-vision-scafolding-sdk

**Structure:**
```
packages/
├── ralph-protocol/       # @aldine/ralph-protocol (can publish separately)
├── mcp-browser/         # @aldine/confucius-mcp-browser (TypeScript)
└── python/              # confucius-mcp-browser (Python wrapper)
```

**Purpose:** Development workspace for maintaining separate packages before bundling into unified package.

---

### 3. Python Agent Framework: `confucius-agent`
**Repository**: https://github.com/Aldine/llm-council-update

**What's Included:**
- Full orchestrator with hierarchical memory
- Extension system (Bash, FileEdit, FileRead, FileSearch, Planning, Thinking)
- **SubagentExtension** (NEW): True delegation with isolated agents
- Ralph loop integration
- Note-taking system
- Multi-provider LLM support (Claude, GPT, Gemini, OpenRouter)

**Install:**
```bash
pip install confucius-agent[all]
```

**Usage:**
```python
from confucius_agent import create_subagent_enabled_agent, create_llm_client

agent = create_subagent_enabled_agent(
    llm_client=create_llm_client('gpt-4'),
    enable_subagents=True
)

result = agent.run_ralph_loop("Fix the failing tests")
```

---

## 🎯 What to Bundle for confucius_agent-ralph_protocols--browser_qa

### Current State
✅ **Already Has:**
- Ralph Protocol v3 (TypeScript)
- Browser MCP Server
- 3-Strike Reset system
- Subagent context generation (`ralph subagent` command)
- Loop scripts (PowerShell, Bash)
- Token rot prevention
- Command whitelisting

❌ **Missing:**
- SubagentExtension implementation (Python only, not needed for TypeScript CLI)
- Test prompts (PROMPT_1, PROMPT_2)
- Usage documentation

### What to Add

#### 1. Test Prompts for Ralph Protocol
Port the test prompts to work with Ralph Protocol CLI:

**PROMPT_1_RALPH_ACCESSIBILITY.md**
- Test Ralph Protocol with accessibility audit workflow
- Forces computed contrast ratios
- Generates verifiable traces via `progress.txt` and `confucius.md`

**PROMPT_2_RALPH_SANITY.md**
- Quick sanity test for Ralph Protocol
- Verifies file operations and command execution
- Tests strike system and reset functionality

#### 2. Enhanced Documentation
- Integration guide for Ralph + Browser MCP
- How to use subagent context generation
- Examples of multi-phase workflows

---

## 🔄 Integration Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Confucius Agent Ecosystem                  │
└─────────────────────────────────────────────────────────────┘

┌──────────────────────┐     ┌──────────────────────┐
│   TypeScript/Node    │     │    Python/pip        │
│  (CLI Tools)         │     │  (Agent Framework)   │
├──────────────────────┤     ├──────────────────────┤
│                      │     │                      │
│  Ralph Protocol v3   │     │  Orchestrator        │
│  - Init/Status       │     │  - MemoryManager     │
│  - Strike System     │     │  - Extensions        │
│  - Subagent Context  │     │  - SubagentExtension │
│  - Loop Scripts      │     │  - Ralph Integration │
│                      │     │                      │
│  Browser MCP         │     │  LLM Clients         │
│  - Screenshot        │     │  - Claude/GPT        │
│  - Contrast Check    │     │  - Gemini/OpenRouter │
│  - Console Monitor   │     │  - Mock Client       │
│                      │     │                      │
└──────────────────────┘     └──────────────────────┘
         │                            │
         │                            │
         └────────────┬───────────────┘
                      │
                      ▼
         ┌────────────────────────┐
         │   Agent Workflows      │
         ├────────────────────────┤
         │ • File scaffolding     │
         │ • Code generation      │
         │ • Testing loops        │
         │ • Accessibility audits │
         │ • Multi-phase tasks    │
         └────────────────────────┘
```

---

## 📋 Implementation Plan

### Phase 1: Port Test Prompts to Ralph Protocol

**Create in `confucius_agent-ralph_protocols--browser_qa`:**

1. **`docs/PROMPT_1_RALPH_AUDIT.md`**
   - Accessibility audit using Ralph Protocol
   - Uses Browser MCP for inspection
   - Outputs to `progress.txt` and `confucius.md`
   - Verifiable via strike count and context files

2. **`docs/PROMPT_2_RALPH_SANITY.md`**
   - Simple file operation test
   - Verifies Ralph Protocol commands work
   - Tests strike system and reset

3. **`docs/TESTING_GUIDE.md`**
   - How to run test prompts
   - Expected outputs
   - Verification criteria

### Phase 2: Enhanced Documentation

**Create:**
- `docs/ARCHITECTURE.md` - System overview
- `docs/INTEGRATION_EXAMPLES.md` - Ralph + Browser MCP workflows
- `docs/SUBAGENT_CONTEXT.md` - How subagent context generation works

### Phase 3: CI/CD Improvements

**Add:**
- GitHub Actions workflow to test Ralph commands
- npm publish workflow
- Automated changelog generation

---

## 🚀 Next Steps

### For `confucius_agent-ralph_protocols--browser_qa`:

```bash
cd confucius_agent-ralph_protocols--browser_qa

# Create docs directory
mkdir -p docs

# Port test prompts (adapted for Ralph Protocol CLI)
cat > docs/PROMPT_1_RALPH_AUDIT.md << 'EOF'
[Content adapted from PROMPT_1_FULL_AUDIT.md for Ralph CLI]
EOF

# Port sanity test
cat > docs/PROMPT_2_RALPH_SANITY.md << 'EOF'
[Content adapted from PROMPT_2_SANITY_TEST.md for Ralph CLI]
EOF

# Add testing guide
cat > docs/TESTING_GUIDE.md << 'EOF'
[Usage instructions for Ralph Protocol test prompts]
EOF

# Build and test
npm run build
npm test

# Commit changes
git add docs/
git commit -m "docs: Add test prompts and enhanced documentation"
git push origin main

# Publish to npm
npm version patch
npm publish
```

---

## 📦 Final Package Boundaries

### What Goes Where:

| Feature | confucius_agent-ralph_protocols--browser_qa | llm-council-update |
|---------|---------------------------------------------|---------------------|
| Ralph Protocol CLI | ✅ TypeScript | ❌ |
| Browser MCP Server | ✅ TypeScript | ❌ |
| Orchestrator | ❌ | ✅ Python |
| Extensions | ❌ | ✅ Python |
| SubagentExtension | ❌ | ✅ Python |
| Test Prompts | ✅ Adapted for Ralph | ✅ Original for Python |
| Loop Scripts | ✅ PowerShell/Bash | ❌ |
| Note-Taking | ❌ | ✅ Python |

---

## 🎯 Summary

**confucius_agent-ralph_protocols--browser_qa** is the **production-ready CLI package** for:
- Project scaffolding (Ralph Protocol)
- Browser automation (Browser MCP)
- Agent loop patterns (ralph-loop.ps1)

**llm-council-update** is the **Python development framework** for:
- Building custom agents
- Advanced orchestration
- Subagent delegation
- Multi-phase workflows

They are **complementary**, not competing:
- Use **Ralph Protocol** for project setup and CLI workflows
- Use **Python Framework** for complex agent logic and delegation
- Use **Browser MCP** from both for visual QA

---

## 📝 Action Items

1. ✅ SubagentExtension implemented in Python framework
2. ✅ Test prompts created for Python framework
3. ⏳ **TODO**: Adapt test prompts for Ralph Protocol CLI
4. ⏳ **TODO**: Add enhanced docs to npm package
5. ⏳ **TODO**: Publish updated `@aldine/confucius-agent` to npm

Want me to create the adapted Ralph Protocol test prompts now?
