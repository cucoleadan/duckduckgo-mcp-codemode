export function homePageHtml(mcpUrl: string): string {
  return `<!DOCTYPE html>
<html class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>DuckDuckGo MCP Codemode</title>
  <style>
    :root{--bg:#09090b;--c1:#18181b;--b:#27272a;--f:#fafafa;--f2:#a1a1aa;--p:#3b82f6;--p2:#1d4ed8;--g:#22c55e}
    *{box-sizing:border-box;margin:0}
    body{font-family:system-ui,sans-serif;background:var(--bg);color:var(--f);display:flex;align-items:center;justify-content:center;min-height:100vh}
    .c{background:var(--c1);border:1px solid var(--b);border-radius:12px;padding:32px;max-width:520px;width:100%}
    h1{font-size:1.15rem;margin:0 0 4px}
    h2{font-size:.93rem;color:var(--f2);font-weight:400;margin:0 0 24px}
    .tools{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px}
    .chip{padding:4px 10px;border-radius:8px;font-size:.82rem;background:var(--bg);border:1px solid var(--b);color:var(--f2)}
    .info{font-size:.85rem;color:var(--f2);line-height:1.6}
    code{font-size:.82rem;color:var(--p);background:var(--bg);padding:2px 6px;border-radius:5px}
    .url{font-family:monospace;font-size:.85rem;color:var(--g);background:var(--bg);padding:8px 12px;border-radius:8px;border:1px solid var(--b);word-break:break-all;margin:12px 0}
  </style>
</head>
<body>
  <div class="c">
    <h1>DuckDuckGo MCP Codemode</h1>
    <h2>Web search + content fetching with Cloudflare Codemode</h2>
    <div class="tools">
      <span class="chip">search</span>
      <span class="chip">fetch_content</span>
      <span class="chip">code (codemode)</span>
    </div>
    <div class="info">
      <p>DuckDuckGo search and web content fetching as MCP tools, wrapped with <strong>Codemode</strong> — LLMs compose multi-step search + fetch workflows as JavaScript in a secure sandbox.</p>
      <p style="margin-top:12px">MCP endpoint:</p>
      <div class="url">${mcpUrl}</div>
      <p style="margin-top:16px">Tools available via <code>codemode.*</code>:</p>
      <ul style="margin:8px 0 0 16px">
        <li><code>codemode.search(query, maxResults?, region?)</code></li>
        <li><code>codemode.fetch_content(url, startIndex?, maxLength?)</code></li>
      </ul>
    </div>
  </div>
</body>
</html>`;
}