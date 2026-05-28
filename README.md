# duckduckgo-mcp-codemode

> DuckDuckGo MCP server on Cloudflare Workers with **Codemode** — LLMs compose multi-step web search and content fetching as JavaScript code in a secure sandbox, at a fraction of the token cost of traditional tool-calling.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cucoleadan/duckduckgo-mcp-codemode)

Built on top of [nickclyde/duckduckgo-mcp-server](https://github.com/nickclyde/duckduckgo-mcp-server) — the original Python MCP server — fully ported to TypeScript and wrapped with [Cloudflare Codemode](https://developers.cloudflare.com/agents/api-reference/codemode/).

---

## What is Codemode?

[Codemode](https://developers.cloudflare.com/agents/api-reference/codemode/) lets LLMs **write and execute JavaScript** that orchestrates your tools instead of calling them one at a time. Inspired by [CodeAct](https://machinelearning.apple.com/research/codeact), it works because LLMs are better at writing code than making individual tool calls — they've seen millions of lines of real-world code but only contrived tool-calling examples.

Instead of exposing `search` and `fetch_content` as separate MCP tools (requiring multiple round-trips), Codemode exposes a single `code` tool. The LLM writes JavaScript that chains any number of operations:

```javascript
async () => {
  const results = await codemode.search({ query: "Cloudflare Workers tutorial", max_results: 5 });
  const firstUrl = results.items?.[0]?.url;
  if (firstUrl) {
    const content = await codemode.fetch_content({ url: firstUrl });
    return { search: results, content };
  }
  return { search: results };
}
```

| Version | `tools/list` tokens | Notes |
|---------|-------------------|-------|
| Traditional MCP (2 tools) | ~2,400 | Each tool described separately |
| **Codemode** | **~1,100** | Single `code` tool with typed interface |

## Features

- **Web Search** — DuckDuckGo HTML search with result parsing, redirect URL cleaning, and region/language support
- **Content Fetching** — Fetch and extract clean text from any webpage, stripping scripts/styles/nav, with pagination support
- **Codemode** — LLMs compose multi-step search + fetch workflows as JavaScript in an isolated Worker sandbox
- **Cloudflare Workers** — Deployed globally at the edge, no server management
- **Rate limiting built-in** — DuckDuckGo's natural rate limits are respected
- **Zero dependencies on Python** — Full TypeScript port of the original `duckduckgo-mcp-server`

## Quick start

### Step 1 — Deploy

Click **Deploy to Cloudflare** above, or use the CLI:

```bash
npm install --legacy-peer-deps
npm run deploy
```

> **Note:** Codemode uses [Cloudflare Dynamic Workers](https://developers.cloudflare.com/agents/api-reference/codemode/) which requires a paid Cloudflare Workers plan.

### Step 2 — Connect your MCP client

Your MCP endpoint lives at:

```
https://duckduckgo-mcp-codemode.<your-subdomain>.workers.dev/mcp
```

#### Claude Desktop

```json
{
  "mcpServers": {
    "ddg-codemode": {
      "command": "npx",
      "args": ["mcp-remote", "https://<worker>/mcp"]
    }
  }
}
```

#### Claude Web (Add custom connector)

| Field | Value |
|-------|-------|
| Name | DuckDuckGo Codemode |
| URL | `https://<worker>/mcp` |
| OAuth | Leave empty |

#### Cursor / any MCP client

Point your client to `https://<worker>/mcp`.

## Available tools (via `codemode.*`)

### `search`

Search DuckDuckGo and return formatted results.

```javascript
const results = await codemode.search({
  query: "Rust programming language",
  max_results: 10,
  region: "us-en"
});
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | `string` | required | The search query |
| `max_results` | `number` | `10` | Max results (1–20) |
| `region` | `string` | `""` | Region code: `us-en`, `uk-en`, `de-de`, `jp-ja`, `wt-wt`, etc. |

### `fetch_content`

Fetch a webpage and extract clean text content.

```javascript
const content = await codemode.fetch_content({
  url: "https://example.com/article",
  start_index: 0,
  max_length: 8000
});
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | `string` | required | URL to fetch (http/https) |
| `start_index` | `number` | `0` | Character offset for pagination |
| `max_length` | `number` | `8000` | Max characters to return |

## Chaining example

```javascript
async () => {
  // Search for a topic
  const results = await codemode.search({ query: "WebAssembly tutorial 2026", max_results: 3 });

  // Fetch the top result
  const topUrl = results.items?.[0]?.url;
  if (!topUrl) return { error: "No results found" };

  const content = await codemode.fetch_content({ url: topUrl, max_length: 4000 });

  return {
    search_results: results,
    top_content_preview: content
  };
}
```

## Architecture

```
Client (LLM) ──POST /mcp──▶ Cloudflare Worker
                                  │
                                  ▼
                           McpServer (upstream)
                           ├─ search tool
                           └─ fetch_content tool
                                  │
                                  ▼
                           codeMcpServer wrapper
                           ├─ Generates typed interface
                           ├─ Single "code" tool exposed
                           └─ DynamicWorkerExecutor
                               └─ Isolated Worker sandbox
                                   └─ codemode.search()
                                   └─ codemode.fetch_content()
```

## Endpoints

| Path | Method | Description |
|------|--------|-------------|
| `GET /` | GET | Landing page with MCP endpoint URL |
| `GET /health` | GET | Health check JSON |
| `POST /mcp` | POST | MCP Streamable HTTP endpoint |

## Local development

```bash
npm install --legacy-peer-deps
npm run build
npm run dev
```

The dev server starts at `http://localhost:8788`. The MCP endpoint is at `http://localhost:8788/mcp`.

Test with the [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npx @modelcontextprotocol/inspector@latest
```

## Comparison with the original

| Feature | [duckduckgo-mcp-server](https://github.com/nickclyde/duckduckgo-mcp-server) | **duckduckgo-mcp-codemode** |
|---------|------|------|
| Language | Python | TypeScript |
| Runtime | Local (uvx) | Cloudflare Workers (edge) |
| Transport | stdio / SSE / streamable-http | Streamable HTTP (remote) |
| Codemode | No | Yes |
| TLS impersonation | curl_cffi (optional) | Not needed (Workers fetch) |
| Auth | None | None (add your own) |
| Token cost (tool discovery) | ~2,400 | ~1,100 |
| Multi-step workflows | Multiple round-trips | Single code execution |

## Security

- Code runs in **isolated Worker sandboxes** — each execution gets its own Worker instance
- External network access (`fetch`, `connect`) is **blocked by default** in sandboxes — only `codemode.*` calls are routed to the host
- Execution has a configurable **timeout** (default 30 seconds)
- Console output is captured separately and does not leak to the host

## License

MIT — based on [nickclyde/duckduckgo-mcp-server](https://github.com/nickclyde/duckduckgo-mcp-server) (MIT).