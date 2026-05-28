import { codeMcpServer } from "@cloudflare/codemode/mcp";
import { DynamicWorkerExecutor } from "@cloudflare/codemode";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

interface Env {
  LOADER: any;
  BROWSER: any;
}

const SERVER_NAME = "ddg-search-codemode";
const SERVER_VERSION = "1.1.0";

const DDG_HTML_URL = "https://html.duckduckgo.com/html/";
const DDG_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

function cleanRedirectUrl(link: string): string {
  if (link.startsWith("//duckduckgo.com/l/?uddg=")) {
    try {
      const uddg = link.split("uddg=")[1]?.split("&")[0];
      return uddg ? decodeURIComponent(uddg) : link;
    } catch {
      return link;
    }
  }
  return link;
}

interface SearchHit {
  title: string;
  url: string;
  snippet: string;
  position: number;
}

function parseDDGHtmlResults(html: string, maxResults: number): SearchHit[] {
  const results: SearchHit[] = [];

  const resultRegex = /<div[^>]*class="result[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
  let match: RegExpExecArray | null;

  while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
    const block = match[1];

    const titleMatch = block.match(
      /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/
    );
    if (!titleMatch) continue;

    let link = titleMatch[1];
    if (link.includes("y.js")) continue;
    link = cleanRedirectUrl(link);

    const title = titleMatch[2].replace(/<[^>]+>/g, "").trim();

    const snippetMatch = block.match(
      /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/
    );
    const snippet = snippetMatch
      ? snippetMatch[1].replace(/<[^>]+>/g, "").trim()
      : "";

    results.push({
      title,
      url: link,
      snippet,
      position: results.length + 1,
    });
  }

  return results;
}

function parseDDGLiteResults(html: string, maxResults: number): SearchHit[] {
  const results: SearchHit[] = [];

  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(html)) !== null && results.length < maxResults) {
    const row = rowMatch[1];

    const linkMatch = row.match(/<a[^>]*class="result-link"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
    if (!linkMatch) continue;

    let link = linkMatch[1];
    if (link.includes("y.js") || link.includes("uddg")) link = cleanRedirectUrl(link);
    if (!link.startsWith("http")) continue;

    const title = linkMatch[2].replace(/<[^>]+>/g, "").trim();
    if (!title) continue;

    const snippetMatch = row.match(/<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/);
    const snippet = snippetMatch
      ? snippetMatch[1].replace(/<[^>]+>/g, "").trim()
      : "";

    results.push({
      title,
      url: link,
      snippet,
      position: results.length + 1,
    });
  }

  if (results.length > 0) return results;

  const anchorRegex = /<a[^>]*href="(https?:\/\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
  let anchorMatch: RegExpExecArray | null;
  const seen = new Set<string>();

  while ((anchorMatch = anchorRegex.exec(html)) !== null && results.length < maxResults) {
    const url = anchorMatch[1];
    if (seen.has(url)) continue;
    seen.add(url);

    if (url.includes("duckduckgo.com")) continue;
    if (url.includes("y.js")) continue;

    const title = anchorMatch[2].replace(/<[^>]+>/g, "").trim();
    if (!title) continue;

    results.push({
      title,
      url,
      snippet: "",
      position: results.length + 1,
    });
  }

  return results;
}

function formatResults(results: SearchHit[]): string {
  if (!results.length) {
    return "No results found. Try rephrasing your search query or try again in a few minutes.";
  }
  const lines: string[] = [`Found ${results.length} search results:\n`];
  for (const r of results) {
    lines.push(`${r.position}. ${r.title}`);
    lines.push(`   URL: ${r.url}`);
    lines.push(`   Summary: ${r.snippet}`);
    lines.push("");
  }
  return lines.join("\n");
}

function stripHtml(html: string): string {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

async function browserSearch(query: string, region: string, maxResults: number, browser: any): Promise<SearchHit[]> {
  const b = await browser.launch();
  try {
    const page = await b.newPage();
    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}${region ? `&kl=${region}` : ""}&ia=web`;
    await page.goto(searchUrl, { waitUntil: "networkidle0", timeout: 15000 });
    await page.waitForSelector('[data-result]', { timeout: 10000 }).catch(() => {});
    const html = await page.content();
    return parseDDGHtmlResults(html, maxResults);
  } finally {
    await b.close();
  }
}

function createUpstreamMcpServer(env: Env): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  server.tool(
    "search",
    "Search the web using DuckDuckGo. Returns a list of results with titles, URLs, and snippets. Uses a headless browser to bypass bot detection. For best results, use specific and descriptive search queries.",
    {
      query: z
        .string()
        .describe(
          "The search query string. Be specific for better results (e.g., 'Python asyncio tutorial' rather than 'Python')."
        ),
      max_results: z
        .number()
        .min(1)
        .max(20)
        .default(10)
        .describe("Maximum number of results to return (default: 10)."),
      region: z
        .string()
        .default("")
        .describe(
          "Optional region/language code. Examples: 'us-en' (USA/English), 'uk-en' (UK/English), 'de-de' (Germany/German), 'fr-fr' (France/French), 'jp-ja' (Japan/Japanese), 'wt-wt' (no region). Leave empty for default."
        ),
    },
    async ({ query, max_results, region }) => {
      try {
        if (env.BROWSER) {
          const results = await browserSearch(query, region, max_results, env.BROWSER);
          if (results.length > 0) {
            return {
              content: [{ type: "text", text: formatResults(results) }],
            };
          }
        }

        const params = new URLSearchParams({
          q: query,
          b: "",
          kl: region || "",
          kp: "-1",
        });

        const response = await fetch(DDG_HTML_URL, {
          method: "POST",
          headers: {
            ...DDG_HEADERS,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        });

        if (!response.ok) {
          return {
            content: [{ type: "text", text: `Search HTTP error: ${response.status}` }],
            isError: true,
          };
        }

        const html = await response.text();

        if (html.includes("anomaly-modal") || html.includes("bots use DuckDuckGo")) {
          return {
            content: [{ type: "text", text: "DuckDuckGo returned a CAPTCHA. Try again in a few minutes, or enable the BROWSER binding for headless browser search." }],
            isError: true,
          };
        }

        let results = parseDDGHtmlResults(html, max_results);
        if (results.length === 0) {
          results = parseDDGLiteResults(html, max_results);
        }

        return {
          content: [{ type: "text", text: formatResults(results) }],
        };
      } catch (e) {
        return {
          content: [
            {
              type: "text",
              text: `Search error: ${e instanceof Error ? e.message : String(e)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "fetch_content",
    "Fetch and extract the main text content from a webpage. Strips out navigation, headers, footers, scripts, and styles to return clean readable text. Use this after searching to read the full content of a specific result.",
    {
      url: z
        .string()
        .describe("The full URL of the webpage to fetch (must start with http:// or https://)."),
      start_index: z
        .number()
        .default(0)
        .describe(
          "Character offset to start reading from (default: 0). Use this to paginate through long content."
        ),
      max_length: z
        .number()
        .default(8000)
        .describe(
          "Maximum number of characters to return (default: 8000). Increase for more content per request."
        ),
    },
    async ({ url, start_index, max_length }) => {
      try {
        const response = await fetch(url, {
          headers: DDG_HEADERS,
          redirect: "follow",
        });

        if (!response.ok) {
          return {
            content: [
              {
                type: "text",
                text: `HTTP error fetching ${url}: ${response.status}`,
              },
            ],
            isError: true,
          };
        }

        const html = await response.text();

        const text = stripHtml(html);
        const totalLength = text.length;
        const sliced = text.slice(start_index, start_index + max_length);
        const isTruncated = start_index + max_length < totalLength;

        let result = sliced;
        result += `\n\n---\n[Content info: Showing characters ${start_index}-${start_index + sliced.length} of ${totalLength} total`;
        if (isTruncated) {
          result += `. Use start_index=${start_index + max_length} to see more`;
        }
        result += "]";

        return {
          content: [{ type: "text", text: result }],
        };
      } catch (e) {
        return {
          content: [
            {
              type: "text",
              text: `Error fetching ${url}: ${e instanceof Error ? e.message : String(e)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  return server;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/health" && request.method === "GET") {
      return new Response(
        JSON.stringify({
          status: "healthy",
          server: SERVER_NAME,
          version: SERVER_VERSION,
          codemode: true,
          browser: !!env.BROWSER,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    if (path === "/" && request.method === "GET") {
      const { homePageHtml } = await import("./home-page.js");
      const mcpUrl = `${url.origin}/mcp`;
      const html = homePageHtml(mcpUrl);
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    }

    if (path === "/mcp" && request.method === "POST") {
      const upstreamServer = createUpstreamMcpServer(env);
      const executor = new DynamicWorkerExecutor({
        loader: env.LOADER,
      });

      const codemodeServer = await codeMcpServer({
        server: upstreamServer,
        executor,
        description: `DuckDuckGo web search + content fetching toolchain.${env.BROWSER ? " Search uses a headless browser to bypass bot detection." : " Note: DuckDuckGo may CAPTCHA-block search from datacenter IPs. Enable BROWSER binding for reliable search."}

Tools available via codemode.*:
  search(query: string, max_results?: number, region?: string) - DuckDuckGo web search
  fetch_content(url: string, start_index?: number, max_length?: number) - Fetch & parse webpage content

Rules:
  - No fetch()/network in sandbox
  - Return an object for the LLM
  - Compose multi-step workflows: search -> fetch_content -> analyze

Example:
async () => {
  const results = await codemode.search({ query: "Cloudflare Workers tutorial" });
  return results;
}

Example chaining:
async () => {
  const search = await codemode.search({ query: "Rust programming language", max_results: 3 });
  return search;
}`,
      });

      const transport = new WebStandardStreamableHTTPServerTransport();
      codemodeServer.connect(transport);
      return transport.handleRequest(request);
    }

    return new Response("Not found", { status: 404 });
  },
};