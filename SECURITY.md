# Security Policy

## Security Model

Confucius Browser MCP SDK is designed with security-first principles:

### 1. Localhost-Only by Default

**Default Behavior:**
- Only `localhost` and `127.0.0.1` origins are allowed
- Port can be customized via `CONFUCIUS_ALLOW_ORIGINS`
- All external URLs are blocked unless explicitly allowlisted

**Why:**
- Prevents accidental navigation to malicious sites
- Protects against SSRF attacks
- Suitable for local development workflows

### 2. Approval Tokens for External URLs

**Default Behavior:**
- Non-localhost URLs require approval token
- Token must match `CONFUCIUS_APPROVAL_TOKEN` environment variable
- Default token: `confucius-default-token` (change this!)

**Why:**
- Prevents unauthorized external navigation
- Adds explicit confirmation layer
- Auditable security boundary

**Usage:**
```bash
export CONFUCIUS_APPROVAL_TOKEN="your-secret-token"
```

Then pass token to tool:
```json
{
  "tool": "open_url",
  "arguments": {
    "url": "https://example.com",
    "approval_token": "your-secret-token"
  }
}
```

### 3. Network Binding

**Chrome DevTools:**
- Always launch with `--remote-debugging-address=127.0.0.1`
- Never expose port 9222 to external networks
- Configure firewall to block external access

**Why:**
- Chrome DevTools Protocol provides full browser control
- External access would allow remote code execution
- Localhost-only is mandatory for security

### 4. Secrets Redaction

**Automatic Redaction:**
- API keys, tokens, passwords automatically redacted from logs
- Cookies, localStorage, sessionStorage never logged
- Authorization headers stripped from log output

**Redacted Fields:**
- `api_key`, `apikey`, `api-key`
- `token`, `secret`, `password`
- `authorization`, `cookie`, `session`

**Why:**
- Prevents credential leaks in logs
- Safe for CI/CD environments
- Complies with security best practices

### 5. Process Isolation

**User Data Directories:**
- Each project should use unique `--user-data-dir`
- Default: `/tmp/chrome-debug` (override recommended)
- Prevents state contamination across projects

**Why:**
- Isolates cookies, cache, localStorage
- Prevents cross-project data leaks
- Enables parallel testing

## Security Best Practices

### ✅ DO:

1. **Change Default Token:**
   ```bash
   export CONFUCIUS_APPROVAL_TOKEN="$(openssl rand -hex 32)"
   ```

2. **Bind Chrome to Localhost:**
   ```bash
   chrome --remote-debugging-address=127.0.0.1
   ```

3. **Use Unique User Data Dirs:**
   ```bash
   chrome --user-data-dir=/tmp/chrome-myproject
   ```

4. **Firewall Port 9222:**
   ```bash
   # Linux
   sudo ufw deny 9222
   
   # Windows
   netsh advfirewall firewall add rule name="Block Chrome DevTools" dir=in action=block protocol=TCP localport=9222
   ```

5. **Audit Allowlist:**
   ```bash
   echo $CONFUCIUS_ALLOW_ORIGINS
   ```

6. **Enable Logging:**
   ```bash
   export LOG_LEVEL=info
   ```

7. **Review MCP Config:**
   - Check `.vscode/mcp.json` or `.mcp.json`
   - Verify environment variables
   - Confirm command is `npx @confucius/mcp-browser`

### ❌ DON'T:

1. **Don't Expose Port 9222:**
   ```bash
   # WRONG: Binds to all interfaces
   chrome --remote-debugging-port=9222
   
   # CORRECT: Binds to localhost only
   chrome --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1
   ```

2. **Don't Disable Approvals Without Understanding:**
   ```bash
   # Dangerous: Allows navigation to any allowlisted URL without confirmation
   export CONFUCIUS_REQUIRE_APPROVAL=false
   ```

3. **Don't Share User Data Dirs:**
   ```bash
   # WRONG: State contamination
   chrome --user-data-dir=/tmp/chrome-debug  # Same for all projects
   
   # CORRECT: Per-project isolation
   chrome --user-data-dir=/tmp/chrome-myproject
   ```

4. **Don't Use Default Token in Production:**
   ```bash
   # WRONG: Default token
   export CONFUCIUS_APPROVAL_TOKEN="confucius-default-token"
   
   # CORRECT: Strong random token
   export CONFUCIUS_APPROVAL_TOKEN="$(openssl rand -hex 32)"
   ```

5. **Don't Add Untrusted Origins:**
   ```bash
   # WRONG: Allows arbitrary external site
   export CONFUCIUS_ALLOW_ORIGINS="http://localhost:5173,https://untrusted-site.com"
   
   # CORRECT: Only trusted origins
   export CONFUCIUS_ALLOW_ORIGINS="http://localhost:5173,http://127.0.0.1:5173"
   ```

## Threat Model

### In-Scope Threats

| Threat | Mitigation |
|--------|------------|
| **SSRF (Server-Side Request Forgery)** | Localhost-only default + allowlist |
| **Unauthorized Navigation** | Approval tokens for external URLs |
| **Remote Code Execution** | Localhost-only Chrome DevTools binding |
| **Credential Leaks** | Automatic redaction in logs |
| **Cross-Project Contamination** | Unique user data directories |
| **Man-in-the-Middle** | Localhost-only communication |

### Out-of-Scope

| Threat | Reason |
|--------|--------|
| **Physical Access to Machine** | Host security responsibility |
| **Compromised Chrome Binary** | Chrome project responsibility |
| **Malicious MCP Host** | User trusts MCP host (VS Code, Claude) |
| **OS-Level Attacks** | Operating system responsibility |

## Reporting Security Issues

**DO NOT** open public GitHub issues for security vulnerabilities.

Instead, email security reports to: **security@confucius-ai.com**

Include:
- Description of vulnerability
- Steps to reproduce
- Impact assessment
- Suggested fix (if any)

We will respond within 48 hours and provide a timeline for fixes.

## Security Disclosure Policy

- **Acknowledgment:** Within 48 hours
- **Triage:** Within 7 days
- **Fix:** Within 30 days for critical issues
- **Release:** Coordinated disclosure after fix

## Security Checklist for Production

- [ ] Chrome launched with `--remote-debugging-address=127.0.0.1`
- [ ] Port 9222 blocked by firewall on external interfaces
- [ ] Strong approval token set (32+ random bytes)
- [ ] Allowlist contains only trusted origins
- [ ] Unique user data directory per project
- [ ] Logging level set appropriately (not debug)
- [ ] MCP config reviewed and validated
- [ ] Security policy acknowledged by team
- [ ] Incident response plan in place

## Security Updates

Stay informed about security updates:

- Watch GitHub repository for security advisories
- Subscribe to release notes
- Monitor npm security advisories: `npm audit`

## Compliance

This SDK follows security best practices from:

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE/SANS Top 25](https://cwe.mitre.org/top25/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)

## License

Security policy licensed under CC BY 4.0

---

**Last Updated:** January 13, 2026  
**Version:** 1.0
