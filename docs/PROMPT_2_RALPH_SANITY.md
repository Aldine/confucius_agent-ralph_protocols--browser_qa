# PROMPT 2: Ralph Protocol Sanity Test

## Goal
Verify Ralph Protocol CLI commands work correctly and produce traceable state changes.

## Rules
1. Use Ralph Protocol commands (`ralph init`, `ralph status`, `ralph progress`, etc.)
2. All changes must be reflected in Ralph state files:
   - `progress.txt` (append-only log)
   - `confucius.md` (state document)
   - `.ralph/strikes.json` (strike counter)
3. Return verification evidence showing file contents changed

## Task
Initialize a test project, create a simple task, log progress, and verify state files were updated.

## Expected Workflow

### Step 1: Initialize Project
```bash
mkdir test-ralph-sanity
cd test-ralph-sanity
ralph init --name "Sanity Test" --vision "Verify Ralph Protocol works"
```

### Step 2: Check Status
```bash
ralph status
```

**Expected Output:**
```
Ralph Protocol Status
====================
Project: Sanity Test
Run ID: ralph_run_1736985234
Strikes: 0/3
State Health: Good

Files:
✓ IDEA.md
✓ PRD.md
✓ tasks.md
✓ progress.txt (1 entries)
✓ confucius.md (under 200 lines)
✓ PROMPT.md
```

### Step 3: Add Task
```bash
ralph task "Read README.md and count lines"
```

**Verify:** `tasks.md` should show new current task

### Step 4: Log Progress
```bash
ralph progress "Task started - reading README.md"
```

**Verify:** `progress.txt` should have new entry with timestamp

### Step 5: Simulate Work and Complete
```bash
# Simulate some work
wc -l README.md

# Log result
ralph progress "Counted 252 lines in README.md - task complete"
```

### Step 6: Check State
```bash
ralph context | head -50
```

**Expected:** Should show IDEA.md, PRD.md, current task, recent progress

---

## Output Format

### Evidence Required

1. **Initial State** (after `ralph init`):
```
Files created:
- IDEA.md (73 bytes)
- PRD.md (421 bytes)
- tasks.md (189 bytes)
- progress.txt (1 line)
- confucius.md (156 lines)
- PROMPT.md (2.1KB)
- .ralph/strikes.json (empty, 0 strikes)
```

2. **Progress Log** (contents of `progress.txt`):
```
2026-01-16T10:23:45Z | INIT | Created project scaffold | Success | Define IDEA.md | PRD.md, tasks.md, confucius.md
2026-01-16T10:24:12Z | TASK | Task started - reading README.md | In Progress | Count lines | README.md
2026-01-16T10:24:28Z | TASK | Counted 252 lines in README.md - task complete | Success | Next task | README.md
```

3. **State Document** (relevant section of `confucius.md`):
```markdown
## Current Task
Read README.md and count lines

## Current State
- What works: Ralph init, status, progress commands
- What fails: None yet
- What you learned: Progress log uses ISO timestamps
```

4. **Strike Counter** (`.ralph/strikes.json`):
```json
{
  "strikes": 0,
  "max_strikes": 3,
  "history": []
}
```

---

## Success Criteria

- ✓ `ralph init` creates all 6 core files
- ✓ `ralph status` shows correct project name and 0 strikes
- ✓ `ralph task` updates `tasks.md` Current Task section
- ✓ `ralph progress` appends to `progress.txt` with ISO timestamp
- ✓ `ralph context` outputs combined state (IDEA + PRD + tasks + progress)
- ✓ All file contents are verifiable (not made up)

## Failure Conditions

- ✗ Files not created after `ralph init`
- ✗ `progress.txt` has no timestamp or wrong format
- ✗ `confucius.md` exceeds 200 lines after init
- ✗ `ralph status` command fails
- ✗ State files show content that doesn't match commands executed

---

## Verification Script

```bash
# Run this to verify sanity test passed
#!/bin/bash

echo "=== Ralph Protocol Sanity Check ==="

# Check files exist
echo "Checking files..."
test -f IDEA.md && echo "✓ IDEA.md" || echo "✗ IDEA.md missing"
test -f PRD.md && echo "✓ PRD.md" || echo "✗ PRD.md missing"
test -f tasks.md && echo "✓ tasks.md" || echo "✗ tasks.md missing"
test -f progress.txt && echo "✓ progress.txt" || echo "✗ progress.txt missing"
test -f confucius.md && echo "✓ confucius.md" || echo "✗ confucius.md missing"
test -f PROMPT.md && echo "✓ PROMPT.md" || echo "✗ PROMPT.md missing"
test -f .ralph/strikes.json && echo "✓ strikes.json" || echo "✗ strikes.json missing"

# Check progress.txt format
echo ""
echo "Checking progress.txt format..."
if grep -qE "^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}" progress.txt; then
  echo "✓ ISO timestamps present"
else
  echo "✗ Invalid timestamp format"
fi

# Check confucius.md size
echo ""
echo "Checking confucius.md size..."
LINES=$(wc -l < confucius.md)
if [ $LINES -lt 200 ]; then
  echo "✓ confucius.md under 200 lines ($LINES lines)"
else
  echo "✗ confucius.md too large ($LINES lines)"
fi

# Check strike count
echo ""
echo "Checking strikes..."
STRIKES=$(jq '.strikes' .ralph/strikes.json 2>/dev/null || echo "0")
echo "Strikes: $STRIKES/3"

echo ""
echo "=== Sanity Check Complete ==="
```

---

## Usage

### Manual Test:
```bash
cd /tmp
mkdir ralph-sanity-test
cd ralph-sanity-test

# Run commands from workflow above
ralph init --name "Sanity Test"
ralph status
ralph task "Test task"
ralph progress "Test progress entry"

# Verify
cat progress.txt
cat confucius.md | head -30
cat .ralph/strikes.json
```

### Automated Test:
```bash
# Save verification script above as verify-ralph.sh
chmod +x verify-ralph.sh
./verify-ralph.sh
```

---

## Integration with Browser MCP

If testing with Browser MCP:

```bash
# Initialize Ralph project
ralph init --name "Browser Test"

# Initialize Browser MCP
confucius-browser init --host vscode

# Test combined workflow
ralph task "Take screenshot of localhost:3000"

# Use Browser MCP (requires Chrome with remote debugging)
# Then log result
ralph progress "Screenshot captured successfully"
```

This tests that both CLI tools coexist without conflict.
