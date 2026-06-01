# MCP Servers Guide for This Project & Environment

This document helps any AI agent (Grok or otherwise) quickly understand the available external capabilities (MCP servers) in Vincent's Windows + Grok Build TUI environment.

## How Agents Discover and Use MCP Tools Here

This Grok environment provides two built-in tools for working with MCP servers:

- `search_tool` — Discover available tools across all enabled MCP servers. Always call this first with descriptive keywords.
- `use_tool` — Execute a discovered tool using its fully-qualified name (e.g. `filesystem__read_file` or `playwright__navigate`).

**Golden Rule**: Never guess tool names. Start every relevant task by calling `search_tool`.

See the global skill `mcp-usage` (available at `C:\Users\Vincent\.grok\skills\mcp-usage\SKILL.md`) for detailed patterns, Windows-specific advice, and recommended workflows.

## Recommended High-Value Servers

The following servers are the most useful for software engineering work (especially web app development + testing like this project):

1. **filesystem** — Read/write/search/edit local files (scoped for safety).
2. **playwright** — Full browser automation and testing (Microsoft's official server).
3. **desktop-commander** — Terminal execution, git, advanced file ops, and process control.
4. **context7** — Accurate, up-to-date library documentation.
5. **sequential-thinking** — Better multi-step reasoning.
6. **brave-search** (or similar) — Real-time web information.

You (the agent) should use `search_tool` with queries like:
- "filesystem"
- "playwright browser"
- "terminal command"
- "context7 docs"

## Configuration Locations

- **Global** (all projects): `C:\Users\Vincent\.grok\config.toml`
- **This project**: `.grok/config.toml` (in this folder)
- CLI management: Use `grok mcp list`, `grok mcp add`, `grok mcp remove`

Project-scoped servers take precedence.

## Current Project Context (Invoice Chase)

This is a lightweight, client-only Progressive Web App:
- Pure static files (index.html + app.js + manifest + sw.js)
- Heavy use of client-side Tesseract.js and EmailJS
- Strong emphasis on mobile-first UX and Playwright-based visual + functional testing
- Deployed via GitHub → Netlify/Vercel/etc.

Ideal MCP-powered workflows here include:
- Editing code via the filesystem server
- Running local dev server + using Playwright MCP to test flows
- Using terminal MCP to run builds, tests, or deployment CLIs
- Referencing Context7 before touching modern web APIs

## How to Add These Servers (if not already configured)

Run these in PowerShell (adjust paths as needed):

```powershell
# Filesystem (scoped to your Coding folder)
grok mcp add filesystem --command npx --args -- -y @modelcontextprotocol/server-filesystem "C:\Users\Vincent\Documents\Coding"

# Playwright (Microsoft official)
grok mcp add playwright --command npx --args -- -y @microsoft/playwright-mcp

# Desktop Commander (powerful terminal + ops)
grok mcp add desktop-commander --command npx --args -- -y desktop-commander-mcp

# Context7
grok mcp add context7 --command npx --args -- -y @upstash/context7-mcp

# Others
grok mcp add sequential-thinking --command npx --args -- -y @modelcontextprotocol/server-sequential-thinking
grok mcp add brave-search --command npx --args -- -y @modelcontextprotocol/server-brave-search
```

After adding, restart the Grok TUI or use the `/mcps` modal (`Ctrl+L`) to verify and enable them.

## Additional Resources

- Global MCP documentation: `C:\Users\Vincent\.grok\docs\user-guide\07-mcp-servers.md`
- Global MCP usage skill: `C:\Users\Vincent\.grok\skills\mcp-usage\SKILL.md`
- Official MCP spec: https://modelcontextprotocol.io
- Registry: https://registry.modelcontextprotocol.io/

When starting work on this or any project, the agent should:
1. Read this `MCP.md`
2. Activate the `mcp-usage` skill if available
3. Run `search_tool` to see what is currently connected in the session
4. Proceed with the appropriate servers for the task

This setup makes external capabilities (filesystem, browser testing, terminal, etc.) reliably available across sessions and agents.
