# PROMPT 1: Ralph Protocol + Browser MCP Accessibility Audit

## Goal
Execute a complete accessibility audit using Ralph Protocol for orchestration and Browser MCP for inspection. Produce measurable output with computed contrast ratios, code patches, and verifiable state changes.

## Rules

### 1. Ralph Protocol State Management
All work must be tracked in Ralph state files:
- `progress.txt`: Append-only log with ISO timestamps
- `confucius.md`: Living state document (max 200 lines)
- `tasks.md`: Task breakdown
- `.ralph/strikes.json`: Failure tracking

### 2. Browser MCP Integration
Use `confucius-browser` tools for inspection:
- `browser.screenshot`: Capture visual state
- `browser.console`: Monitor errors
- Browser DevTools or curl for computed styles

### 3. Computed Values Required
All contrast ratios must use **real math**:
```
Luminance: L = 0.2126*R + 0.7152*G + 0.0722*B (sRGB normalized)
Contrast: (L1 + 0.05) / (L2 + 0.05) where L1 > L2
```

### 4. Verification
State changes must be provable:
- Before/after file diffs
- Strike count changes
- Progress log entries with timestamps

---

## Task

### Context
You have:
- A local web app at `http://localhost:3000`
- Dark mode toggle
- Suspected WCAG AA contrast failures
- Missing focus ring indicators

### Deliverables

1. **Ralph Project Setup**
   - Initialize with `ralph init --name "Accessibility Audit"`
   - Set task breakdown in `tasks.md`

2. **Audit Report** (6 UI elements minimum)
   - Body text
   - H1 heading
   - Hyperlink
   - Primary button
   - Secondary button
   - Muted caption

   For each:
   - Element selector
   - Foreground color (hex)
   - Background color (hex)
   - Font size (px)
   - Font weight
   - **Computed contrast ratio** (exact decimal)
   - WCAG AA status (Pass/Fail)

3. **Focus Ring Audit** (3 interactive elements)
   - Describe current indicator
   - Measure contrast vs background
   - Flag if < 3:1

4. **Fix Proposal**
   - Before/after colors
   - Reason for each change
   - New contrast ratios

5. **Patch Output**
   - CSS or Tailwind diffs

6. **Verification**
   - Re-check same 6 elements after fixes
   - Updated ratios
   - Progress log showing all phases

7. **State Files**
   - Final `progress.txt` with all entries
   - Final `confucius.md` with audit summary
   - Strike count (should be 0 if successful)

---

## Execution Steps

### Phase 1: Setup (Ralph Protocol)

```bash
# Initialize project
ralph init --name "Accessibility Audit" --vision "WCAG AA compliance for localhost:3000"

# Set initial task
ralph task "Phase 1: Inspect UI elements and extract colors"

# Initialize Browser MCP
confucius-browser init --host vscode
confucius-browser doctor  # Verify Chrome connection
```

**Log progress:**
```bash
ralph progress "Project initialized, Browser MCP configured"
```

### Phase 2: Inspection (Browser MCP + CLI)

```bash
# Start Chrome with remote debugging
chrome --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1

# Extract HTML (method 1: curl)
curl http://localhost:3000 > page.html

# Or use browser tools (method 2: screenshot + styles)
# confucius-browser screenshot --url http://localhost:3000

# Read CSS files
cat src/styles.css
cat tailwind.config.js  # if using Tailwind

# Extract computed colors for 6 elements
# (Use DevTools, grep, or node script)
```

**Log progress:**
```bash
ralph progress "Extracted HTML and CSS, identified 6 target elements"
```

### Phase 3: Analysis (Calculate Contrast)

**Create analysis script:**
```javascript
// contrast.js
function luminance(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  r = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
  g = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
  b = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hex1, hex2) {
  const r1 = parseInt(hex1.slice(1, 3), 16);
  const g1 = parseInt(hex1.slice(3, 5), 16);
  const b1 = parseInt(hex1.slice(5, 7), 16);
  const r2 = parseInt(hex2.slice(1, 3), 16);
  const g2 = parseInt(hex2.slice(3, 5), 16);
  const b2 = parseInt(hex2.slice(5, 7), 16);
  
  const l1 = luminance(r1, g1, b1);
  const l2 = luminance(r2, g2, b2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  
  return ((lighter + 0.05) / (darker + 0.05)).toFixed(2);
}

// Test elements
console.log("Body text (#333 on #fff):", contrastRatio("#333333", "#ffffff"));
console.log("Link (#6ba3ff on #fff):", contrastRatio("#6ba3ff", "#ffffff"));
// ... etc for 6 elements
```

```bash
node contrast.js > audit-results.txt
cat audit-results.txt
```

**Log progress:**
```bash
ralph progress "Calculated contrast ratios for 6 elements, 3 failures detected"
```

**Update state:**
```bash
# Update confucius.md manually or with script
# Add findings to "Current State" section
```

### Phase 4: Generate Fixes

```bash
# Update task
ralph task "Phase 2: Generate CSS fixes for failing contrasts"

# Create fixes (manual or script)
cat > fixes.css << 'EOF'
/* Contrast fixes */
a { color: #0056b3; }  /* Was #6ba3ff, now 5.02:1 */
.btn-secondary { color: #004a99; }  /* Was #0066cc, now 4.73:1 */
.text-muted { color: #767676; }  /* Was #999999, now 4.54:1 */
EOF
```

**Log progress:**
```bash
ralph progress "Generated fixes for 3 failing elements: link, secondary button, muted text"
```

### Phase 5: Apply Patches

```bash
# Backup original
cp src/styles.css src/styles.css.bak

# Apply fixes
cat fixes.css >> src/styles.css

# Or use patch
git diff src/styles.css > audit-fixes.patch
```

**Log progress:**
```bash
ralph progress "Applied CSS fixes to src/styles.css"
```

### Phase 6: Verification

```bash
# Re-run contrast calculations
node contrast.js > audit-results-after.txt

# Compare
diff audit-results.txt audit-results-after.txt
```

**Log progress:**
```bash
ralph progress "Verification complete: All 6 elements now pass WCAG AA"
```

### Phase 7: Finalize

```bash
# Update task status
ralph task "Audit complete - all issues resolved"

# Final status check
ralph status

# Generate summary
ralph context > audit-summary.md
```

---

## Output Format

### 1. Progress Log (`progress.txt`)

```
2026-01-16T14:30:12Z | INIT | Created project scaffold | Success | Start audit | IDEA.md, PRD.md, tasks.md
2026-01-16T14:32:45Z | PHASE1 | Extracted HTML and CSS | Success | Analyze colors | page.html, styles.css
2026-01-16T14:35:22Z | PHASE2 | Calculated 6 contrast ratios | Found issues | Generate fixes | audit-results.txt
2026-01-16T14:38:10Z | PHASE3 | Generated CSS fixes | Success | Apply patches | fixes.css
2026-01-16T14:40:33Z | PHASE4 | Applied fixes to styles.css | Success | Verify | styles.css.bak
2026-01-16T14:42:18Z | PHASE5 | Re-verified all elements | Success | Complete | audit-results-after.txt
2026-01-16T14:43:05Z | COMPLETE | Audit finished - 3 issues fixed | Success | Document | audit-summary.md
```

### 2. Audit Findings (in `confucius.md` or separate file)

| Element | Foreground | Background | Size | Weight | Contrast | WCAG AA |
|---------|-----------|------------|------|--------|----------|---------|
| Body text | #333333 | #ffffff | 16px | 400 | 12.63:1 | ✓ Pass |
| H1 heading | #1a1a1a | #ffffff | 32px | 700 | 16.05:1 | ✓ Pass |
| Link | #6ba3ff | #ffffff | 16px | 400 | 2.89:1 | ✗ Fail |
| Primary button | #ffffff | #0066cc | 16px | 600 | 4.54:1 | ✓ Pass |
| Secondary button | #0066cc | #e6f2ff | 16px | 600 | 3.12:1 | ✗ Fail |
| Muted caption | #999999 | #ffffff | 14px | 400 | 2.85:1 | ✗ Fail |

### 3. Fix Proposal

**Link Color:**
- Before: `#6ba3ff` (2.89:1)
- After: `#0056b3` (5.02:1)
- Reason: Too light, fails WCAG AA

**Secondary Button:**
- Before: `#0066cc` on `#e6f2ff` (3.12:1)
- After: `#004a99` on `#e6f2ff` (4.73:1)
- Reason: Darken text to meet 4.5:1

**Muted Caption:**
- Before: `#999999` (2.85:1)
- After: `#767676` (4.54:1)
- Reason: Darken gray to minimum contrast

### 4. Patch (Git diff style)

```diff
diff --git a/src/styles.css b/src/styles.css
index abc123..def456 100644
--- a/src/styles.css
+++ b/src/styles.css
@@ -45,7 +45,7 @@
 
 /* Links */
 a {
-  color: #6ba3ff;
+  color: #0056b3;
   text-decoration: underline;
 }
 
@@ -67,7 +67,7 @@
 }
 
 .btn-secondary {
-  color: #0066cc;
+  color: #004a99;
   background: #e6f2ff;
   border: 1px solid #0066cc;
 }
@@ -89,7 +89,7 @@
 
 /* Typography */
 .text-muted {
-  color: #999999;
+  color: #767676;
   font-size: 0.875rem;
 }
```

### 5. Verification Results

| Element | Foreground | Background | Contrast | WCAG AA |
|---------|-----------|------------|----------|---------|
| Body text | #333333 | #ffffff | 12.63:1 | ✓ Pass |
| H1 heading | #1a1a1a | #ffffff | 16.05:1 | ✓ Pass |
| Link | #0056b3 | #ffffff | 5.02:1 | ✓ Pass ⬆ |
| Primary button | #ffffff | #0066cc | 4.54:1 | ✓ Pass |
| Secondary button | #004a99 | #e6f2ff | 4.73:1 | ✓ Pass ⬆ |
| Muted caption | #767676 | #ffffff | 4.54:1 | ✓ Pass ⬆ |

**Summary:** 3/6 elements fixed, all now pass WCAG AA

### 6. State Files

**confucius.md excerpt:**
```markdown
## North Star
WCAG AA compliance for all UI elements on localhost:3000

## Current State
- What works: Audit complete, all elements pass WCAG AA
- What fails: Nothing (3 issues resolved)
- What you learned: 
  - Links need 5:1 contrast minimum
  - Muted text still needs 4.5:1
  - Browser MCP + Ralph Protocol work well together

## Current Task
Audit complete - all issues resolved

## Next Steps
1. Document findings in project README
2. Add contrast checks to CI/CD
3. Test dark mode variant
```

**strikes.json:**
```json
{
  "strikes": 0,
  "max_strikes": 3,
  "history": []
}
```

---

## Success Criteria

- ✓ Ralph project initialized with all core files
- ✓ `progress.txt` has 7+ entries with ISO timestamps
- ✓ Audit covers exactly 6 UI elements minimum
- ✓ All contrast ratios computed with formula (exact decimals)
- ✓ Fix proposal includes before/after for each failing element
- ✓ Patch diffs reference real files
- ✓ Verification shows updated ratios after applying patches
- ✓ `confucius.md` under 200 lines
- ✓ Strike count is 0 (no failures)
- ✓ Browser MCP integration demonstrated

## Failure Conditions

- ✗ No `progress.txt` entries or missing timestamps
- ✗ Contrast ratios are estimates ("~4:1", "approximately 4.5")
- ✗ Colors invented (not from actual CSS files)
- ✗ No patch diffs or diffs reference non-existent files
- ✗ Verification identical to findings (no changes applied)
- ✗ `confucius.md` exceeds 200 lines
- ✗ Strikes > 0 without explanation
- ✗ Less than 6 elements audited

---

## Testing This Prompt

### Setup Test Environment:
```bash
# Create simple test app
mkdir test-app
cd test-app
cat > index.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <h1>Test Page</h1>
  <p>Body text with some <a href="#">links</a></p>
  <button class="btn-primary">Primary</button>
  <button class="btn-secondary">Secondary</button>
  <p class="text-muted">Muted caption text</p>
</body>
</html>
EOF

cat > styles.css << 'EOF'
body { color: #333333; background: #ffffff; font-size: 16px; }
h1 { color: #1a1a1a; font-size: 32px; font-weight: 700; }
a { color: #6ba3ff; }
.btn-primary { color: #ffffff; background: #0066cc; }
.btn-secondary { color: #0066cc; background: #e6f2ff; }
.text-muted { color: #999999; font-size: 14px; }
EOF

# Start server
python -m http.server 3000
```

### Run Audit:
```bash
cd ..
mkdir accessibility-audit
cd accessibility-audit

# Follow Phase 1-7 steps above
ralph init --name "Accessibility Audit"
# ... continue with workflow
```

---

## Notes

This prompt tests:
1. **Ralph Protocol CLI**: All commands (`init`, `task`, `progress`, `status`, `context`)
2. **State Management**: Files tracked, under 200 lines, append-only log
3. **Browser MCP**: Integration with `confucius-browser` (optional but recommended)
4. **Real Computation**: Forces exact contrast math, catches hallucinations
5. **Verification Loop**: Before/after comparison proves changes worked
6. **Multi-Phase Workflow**: Tests orchestration across 7 phases

The output is **fully verifiable** by reading the generated state files.
