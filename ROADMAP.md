# Confucius SDK Implementation Roadmap

> From Quality Infrastructure to Full Agent SDK

## Current State (v1.0.4)
- ✅ Ralph Protocol v3 (supervised recursion, 3-strike policy)
- ✅ Browser QA MCP (CDP, WCAG testing)
- ✅ AI Agent Focusing System (ESLint strict, TypeScript strict)
- ✅ Quality gates and verification commands

## Target State (v2.0.0)
Full Confucius SDK as described in the paper:
- Orchestrator loop (Algorithm 1)
- Extension system with typed callbacks
- Hierarchical working memory
- Automated note-taking agent
- Context compression with Architect planner
- Meta-agent build-test-improve loop

---

## Phase 1: Extension System Foundation
**Goal:** Define the shape of extensions so tools can be plugged into the agent.

### Deliverables
- [ ] `src/sdk/types.ts` - Core interfaces (IExtension, ParsedAction, ExecutionResult)
- [ ] `src/sdk/registry.ts` - Extension registration and routing
- [ ] `src/sdk/orchestrator.ts` - Basic while loop skeleton
- [ ] Convert existing tools to extension format

### Key Interfaces
```typescript
interface IExtension {
  name: string;
  triggerTag: string;
  parse: (content: string) => ParsedAction | null;
  execute: (action: ParsedAction) => Promise<ExecutionResult>;
}
```

---

## Phase 2: Hierarchical Working Memory
**Goal:** Implement session/entry/runnable scopes for context management.

### Deliverables
- [ ] `src/sdk/memory/working-memory.ts` - Hierarchical memory store
- [ ] `src/sdk/memory/context-window.ts` - Token tracking and limits
- [ ] `src/sdk/memory/serializer.ts` - Memory persistence to filesystem
- [ ] Visibility scopes (session, entry, runnable)

### Memory Structure
```
+-- session_abc123
    +-- hierarchical_memory
        +-- task_analysis.md
        +-- implementation_summary.md
    +-- todo.md
```

---

## Phase 3: Context Compression & Architect Agent
**Goal:** Prevent context overflow with intelligent summarization.

### Deliverables
- [ ] `src/sdk/agents/architect.ts` - Planner agent for summarization
- [ ] `src/sdk/memory/compressor.ts` - Adaptive context compression
- [ ] Token threshold triggers
- [ ] Rolling window of recent messages

### Compression Flow
```
Full History → Threshold Reached → Architect Summarizes → Compressed + Recent
```

---

## Phase 4: Note-Taking Agent & Meta-Agent
**Goal:** Persistent learning and automated agent refinement.

### Deliverables
- [ ] `src/sdk/agents/note-taker.ts` - Trajectory → Markdown distillation
- [ ] `src/sdk/agents/meta-agent.ts` - Build-test-improve loop
- [ ] Hindsight notes for failures
- [ ] Cross-session knowledge retrieval

### Note Categories
- `project/architecture.md`
- `research/findings.md`
- `solutions/bug_fix.md`
- `failures/error_patterns.md`

---

## Migration Strategy

### Preserve Existing Value
- Ralph Protocol v3 becomes extensions (bash, file-edit, loop)
- Browser QA MCP becomes perception extension
- ESLint/TypeScript verification becomes quality gate extension

### New Package Structure
```
src/
├── sdk/                    # NEW: Confucius SDK core
│   ├── orchestrator.ts     # Algorithm 1 loop
│   ├── registry.ts         # Extension management
│   ├── types.ts            # Core interfaces
│   ├── extensions/         # Tool implementations
│   ├── memory/             # Hierarchical memory
│   └── agents/             # Architect, NoteTaker, Meta
├── ralph/                  # EXISTING: CLI commands
├── browser/                # EXISTING: MCP server
└── index.ts
```

---

## Success Metrics

| Phase | Metric | Target |
|-------|--------|--------|
| 1 | Extensions registered | 5+ core tools |
| 2 | Memory scopes working | 3 visibility levels |
| 3 | Context compression ratio | 40%+ reduction |
| 4 | Note retrieval accuracy | Relevant notes found |

---

## Timeline Estimate
- **Phase 1:** 1-2 weeks (Foundation)
- **Phase 2:** 2-3 weeks (Memory)
- **Phase 3:** 2-3 weeks (Compression)
- **Phase 4:** 3-4 weeks (Agents)

**Total:** 8-12 weeks to full Confucius SDK

---

## References
- [Confucius Code Agent Paper](https://arxiv.org/abs/2512.10398v5)
- [Algorithm 1: Orchestrator Loop](docs/algorithm-1.md)
- [AX/UX/DX Design Philosophy](docs/design-philosophy.md)
