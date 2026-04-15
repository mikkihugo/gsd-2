/**
 * search_and_read tool — web search + content extraction for AI agents.
 *
 * Single-call web search + page content extraction optimized for AI agents.
 * Unlike search-the-web → fetch_page (two steps), this returns pre-extracted,
 * relevance-scored page content in one API call.
 *
 * Supports two backends:
 * - Tavily: POST-based, client-side token budgeting via budgetContent()
 * - Brave: GET-based LLM Context API with server-side budgeting
 *
 * Provider is selected by resolveSearchProvider() — same as tool-search.ts.
 *
 * Best for: "I need to know about X" — when you want content, not just links.
 * Use search-the-web when you want links/URLs to browse selectively.
 */

import type { ExtensionAPI } from "@sf-run/pi-coding-agent";
import { truncateHead, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from "@sf-run/pi-coding-agent";
import { Text } from "@sf-run/pi-tui";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@sf-run/pi-ai";

import { LRUTTLCache } from "./cache.js";
import { fetchWithRetryTimed, HttpError, classifyError, type RateLimitInfo } from "./http.js";
import { normalizeQuery, extractDomain } from "./url-utils.js";
import { formatLLMContext, type LLMContextSnippet, type LLMContextSource } from "./format.js";
import type { TavilyResult, TavilySearchResponse } from "./tavily.js";
import { publishedDateToAge } from "./tavily.js";
import { getTavilyApiKey, getOllamaApiKey, getBraveApiKey, braveHeaders, resolveSearchProvider } from "./provider.js";

// =============================================================================
// Types
// =============================================================================

interface BraveLLMContextResponse {
  grounding?: {
    generic?: Array<{
      url: string;
      title: string;
      snippets: string[];
    }>;
    poi?: {
      name: string;
      url: string;
      title: string;
      snippets: string[];
    } | null;
    map?: Array<{
      name: string;
      url: string;
      title: string;
      snippets: string[];
    }>;
  };
  sources?: Record<string, {
    title: string;
    hostname: string;
    age: string[] | null;
  }>;
}

interface CachedLLMContext {
  grounding: LLMContextSnippet[];
  sources: Record<string, LLMContextSource>;
  estimatedTokens: number;
}

interface LLMContextDetails {
  query: string;
  sourceCount: number;
  snippetCount: number;
  estimatedTokens: number;
  cached: boolean;
  latencyMs?: number;
  rateLimit?: RateLimitInfo;
  threshold?: string;
  maxTokens?: number;
  errorKind?: string;
  error?: string;
  retryAfterMs?: number;
  provider?: 'tavily' | 'brave' | 'ollama' | 'combosearch';
}

// =============================================================================
// Cache
// =============================================================================

// LLM Context cache: max 50 entries, 10-minute TTL
const contextCache = new LRUTTLCache<CachedLLMContext>({ max: 50, ttlMs: 600_000 });
contextCache.startPurgeInterval(60_000);

// =============================================================================
// Helpers
// =============================================================================

/** Rough token estimate: ~4 chars per token for English text. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Distribute a token budget across Tavily results to build LLM context.
 *
 * Client-side equivalent of Brave's server-side LLM Context API budgeting.
 * Filters by score threshold, sorts by relevance, and truncates content to fit
 * within the token budget. Uses `raw_content` when available (richer text from
 * Tavily's "advanced" search depth), falling back to `content`.
 *
 * @param results  — Raw Tavily search results
 * @param maxTokens — Caller-requested token limit
 * @param threshold — Minimum score (0–1) for inclusion
 * @returns Grounding snippets, source metadata, and estimated token usage
 */
export function budgetContent(
  results: TavilyResult[],
  maxTokens: number,
  threshold: number,
): { grounding: LLMContextSnippet[]; sources: Record<string, LLMContextSource>; estimatedTokens: number } {
  // Filter by score threshold and sort by score descending (highest relevance first)
  const filtered = results
    .filter(r => r.score >= threshold)
    .sort((a, b) => b.score - a.score);

  if (filtered.length === 0) {
    return { grounding: [], sources: {}, estimatedTokens: 0 };
  }

  // Use 80% of maxTokens as effective budget (conservative to avoid overshoot)
  const effectiveBudget = Math.floor(maxTokens * 0.8);
  const perResultBudget = Math.max(1, Math.floor(effectiveBudget / filtered.length));

  const grounding: LLMContextSnippet[] = [];
  const sources: Record<string, LLMContextSource> = {};
  let totalTokens = 0;

  for (const result of filtered) {
    if (totalTokens >= effectiveBudget) break;

    const remainingBudget = effectiveBudget - totalTokens;
    const budget = Math.min(perResultBudget, remainingBudget);

    // Use raw_content if available, fall back to content
    let text = result.raw_content ?? result.content;

    // Truncate to per-result budget (tokens → chars at ~4 chars/token)
    const maxChars = budget * 4;
    if (text.length > maxChars) {
      text = text.slice(0, maxChars);
    }

    const tokens = estimateTokens(text);
    totalTokens += tokens;

    grounding.push({
      url: result.url,
      title: result.title || "(untitled)",
      snippets: [text],
    });

    // Build source with age in [null, null, ageString] format for formatLLMContext compatibility.
    // formatLLMContext reads source.age?.[2] for the human-readable age display.
    const ageString = result.published_date ? publishedDateToAge(result.published_date) : undefined;
    sources[result.url] = {
      title: result.title || "(untitled)",
      hostname: extractDomain(result.url),
      age: ageString ? [null as unknown as string, null as unknown as string, ageString] : null,
    };
  }

  return { grounding, sources, estimatedTokens: totalTokens };
}

// =============================================================================
// Tavily LLM Context Execution
// =============================================================================

/** Map threshold names to Tavily score cutoffs. */
const THRESHOLD_TO_SCORE: Record<string, number> = {
  strict: 0.7,
  balanced: 0.5,
  lenient: 0.3,
};

/**
 * Execute a search_and_read query against the Tavily API.
 *
 * Uses POST with advanced search depth + raw_content to get full page text,
 * then feeds results through budgetContent() for client-side token budgeting.
 */
async function executeTavilyLLMContext(
  params: { query: string; maxTokens: number; maxUrls: number; threshold: string; count: number },
  signal?: AbortSignal,
): Promise<{ cached: CachedLLMContext; latencyMs: number; rateLimit?: RateLimitInfo }> {
  const scoreThreshold = THRESHOLD_TO_SCORE[params.threshold] ?? 0.5;

  const requestBody: Record<string, unknown> = {
    query: params.query,
    max_results: params.count,
    search_depth: "advanced",
    include_raw_content: true,
    include_answer: true,
  };

  const timed = await fetchWithRetryTimed("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${getTavilyApiKey()}`,
    },
    body: JSON.stringify(requestBody),
    signal,
  }, 2);

  const data: TavilySearchResponse = await timed.response.json();
  const cached = budgetContent(data.results, params.maxTokens, scoreThreshold);

  return { cached, latencyMs: timed.latencyMs, rateLimit: timed.rateLimit };
}

// =============================================================================
// Ollama LLM Context Execution
// =============================================================================

interface OllamaWebSearchResult {
  title: string;
  url: string;
  content: string;
}

interface OllamaWebSearchResponse {
  results: OllamaWebSearchResult[];
}

/**
 * Execute a search_and_read query against the Ollama web_search API.
 *
 * Uses the same web_search endpoint as tool-search, then applies
 * budgetContent() for client-side token budgeting (similar to Tavily path).
 */
async function executeOllamaLLMContext(
  params: { query: string; maxTokens: number; count: number; threshold: string },
  signal?: AbortSignal,
): Promise<{ cached: CachedLLMContext; latencyMs: number; rateLimit?: RateLimitInfo }> {
  const scoreThreshold = THRESHOLD_TO_SCORE[params.threshold] ?? 0.5;

  const timed = await fetchWithRetryTimed("https://ollama.com/api/web_search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${getOllamaApiKey()}`,
    },
    body: JSON.stringify({ query: params.query, max_results: params.count }),
    signal,
  }, 2);

  const data: OllamaWebSearchResponse = await timed.response.json();

  // Convert Ollama results to TavilyResult-compatible format for budgetContent
  const tavilyLikeResults: TavilyResult[] = (data.results || []).map(r => ({
    title: r.title || "(untitled)",
    url: r.url,
    content: r.content || "",
    score: 1.0, // Ollama doesn't provide scores, assume all are relevant
  }));

  const cached = budgetContent(tavilyLikeResults, params.maxTokens, scoreThreshold);

  return { cached, latencyMs: timed.latencyMs, rateLimit: timed.rateLimit };
}

async function executeBraveLLMContext(
  params: { query: string; maxTokens: number; maxUrls: number; threshold: string; count: number },
  signal?: AbortSignal,
): Promise<{ cached: CachedLLMContext; latencyMs: number; rateLimit?: RateLimitInfo }> {
  const url = new URL("https://api.search.brave.com/res/v1/llm/context");
  url.searchParams.append("q", params.query);
  url.searchParams.append("count", String(params.count));
  url.searchParams.append("maximum_number_of_tokens", String(params.maxTokens));
  url.searchParams.append("maximum_number_of_urls", String(params.maxUrls));
  url.searchParams.append("context_threshold_mode", params.threshold);

  const timed = await fetchWithRetryTimed(url.toString(), {
    method: "GET",
    headers: braveHeaders(),
    signal,
  }, 2);

  const data: BraveLLMContextResponse = await timed.response.json();
  const grounding: LLMContextSnippet[] = [];

  if (data.grounding?.generic) {
    for (const item of data.grounding.generic) {
      if (item.snippets && item.snippets.length > 0) {
        grounding.push({
          url: item.url,
          title: item.title,
          snippets: item.snippets,
        });
      }
    }
  }

  if (data.grounding?.poi && data.grounding.poi.snippets?.length) {
    grounding.push({
      url: data.grounding.poi.url,
      title: data.grounding.poi.title || data.grounding.poi.name,
      snippets: data.grounding.poi.snippets,
    });
  }

  if (data.grounding?.map) {
    for (const item of data.grounding.map) {
      if (item.snippets?.length) {
        grounding.push({
          url: item.url,
          title: item.title || item.name,
          snippets: item.snippets,
        });
      }
    }
  }

  const sources: Record<string, LLMContextSource> = {};
  if (data.sources) {
    for (const [sourceUrl, sourceInfo] of Object.entries(data.sources)) {
      sources[sourceUrl] = {
        title: sourceInfo.title,
        hostname: sourceInfo.hostname,
        age: sourceInfo.age,
      };
    }
  }

  const allText = grounding.map(g => g.snippets.join(" ")).join(" ");
  const estimatedTokens = estimateTokens(allText);
  return { cached: { grounding, sources, estimatedTokens }, latencyMs: timed.latencyMs, rateLimit: timed.rateLimit };
}

function availableComboProviders(): Array<'tavily' | 'brave' | 'ollama'> {
  const providers: Array<'tavily' | 'brave' | 'ollama'> = [];
  if (getTavilyApiKey()) providers.push('tavily');
  if (getBraveApiKey()) providers.push('brave');
  if (getOllamaApiKey()) providers.push('ollama');
  return providers;
}

function trimMergedContext(
  grounding: LLMContextSnippet[],
  sources: Record<string, LLMContextSource>,
  maxTokens: number,
): CachedLLMContext {
  const effectiveBudget = Math.max(1, Math.floor(maxTokens * 0.8));
  const trimmed: LLMContextSnippet[] = [];
  let totalTokens = 0;

  for (const item of grounding) {
    if (totalTokens >= effectiveBudget) break;
    const remainingTokens = effectiveBudget - totalTokens;
    const maxChars = remainingTokens * 4;
    const joined = item.snippets.join("\n\n");
    let text = joined;
    if (text.length > maxChars) {
      text = text.slice(0, maxChars);
    }
    const tokens = estimateTokens(text);
    if (tokens <= 0) continue;
    trimmed.push({
      url: item.url,
      title: item.title,
      snippets: [text],
    });
    totalTokens += tokens;
  }

  return { grounding: trimmed, sources, estimatedTokens: totalTokens };
}

async function executeComboLLMContext(
  params: { query: string; maxTokens: number; maxUrls: number; threshold: string; count: number },
  signal?: AbortSignal,
): Promise<{ cached: CachedLLMContext; latencyMs: number; rateLimit?: RateLimitInfo }> {
  const providers = availableComboProviders();
  const tasks = providers.map(async (provider) => {
    if (provider === 'tavily') {
      return executeTavilyLLMContext(params, signal);
    }
    if (provider === 'ollama') {
      return executeOllamaLLMContext(
        { query: params.query, maxTokens: params.maxTokens, count: params.count, threshold: params.threshold },
        signal,
      );
    }
    return executeBraveLLMContext(params, signal);
  });

  const settled = await Promise.allSettled(tasks);
  const fulfilled = settled.filter((entry): entry is PromiseFulfilledResult<{ cached: CachedLLMContext; latencyMs: number; rateLimit?: RateLimitInfo }> => entry.status === 'fulfilled');
  if (fulfilled.length === 0) {
    const firstRejected = settled.find((entry): entry is PromiseRejectedResult => entry.status === 'rejected');
    throw firstRejected?.reason ?? new Error("combosearch llm context failed");
  }

  const byUrl = new Map<string, LLMContextSnippet>();
  const sources: Record<string, LLMContextSource> = {};

  for (const entry of fulfilled) {
    for (const item of entry.value.cached.grounding) {
      const existing = byUrl.get(item.url);
      if (existing) {
        const snippets = Array.from(new Set([...existing.snippets, ...item.snippets]));
        byUrl.set(item.url, { ...existing, snippets });
      } else {
        byUrl.set(item.url, { ...item, snippets: [...item.snippets] });
      }
    }
    Object.assign(sources, entry.value.cached.sources);
  }

  const mergedGrounding = Array.from(byUrl.values()).slice(0, params.maxUrls);
  const cached = trimMergedContext(mergedGrounding, sources, params.maxTokens);
  const latencyMs = Math.max(...fulfilled.map((entry) => entry.value.latencyMs));
  const rateLimit = fulfilled.find((entry) => entry.value.rateLimit)?.value.rateLimit;
  return { cached, latencyMs, rateLimit };
}

// =============================================================================
// Tool Registration
// =============================================================================

export function registerLLMContextTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: "search_and_read",
    label: "Search & Read",
    description:
      "Search the web AND read page content in a single call. Returns pre-extracted, " +
      "relevance-scored text from multiple pages — no separate fetch_page needed. " +
      "Best when you need content, not just links. " +
      "For selective URL browsing, use search-the-web + fetch_page instead.",
    promptSnippet: "Search and read web page content in one step",
    promptGuidelines: [
      "Use search_and_read when you need actual page content about a topic — it searches and extracts in one call.",
      "Prefer search_and_read over search-the-web + fetch_page when you just need to learn about something.",
      "Use search-the-web when you need to browse specific URLs, control which pages to read, or want just links.",
      "Start with the default maxTokens (8192). Use smaller values (2048-4096) for simple factual queries.",
      "Use threshold='strict' for focused, high-relevance results. Use 'lenient' for broad coverage.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Search query — what you want to learn about" }),
      maxTokens: Type.Optional(
        Type.Number({
          minimum: 1024,
          maximum: 32768,
          default: 8192,
          description: "Approximate maximum tokens of content to return (default: 8192). Lower = faster + cheaper inference.",
        })
      ),
      maxUrls: Type.Optional(
        Type.Number({
          minimum: 1,
          maximum: 20,
          default: 10,
          description: "Maximum number of source URLs to include (default: 10).",
        })
      ),
      threshold: Type.Optional(
        StringEnum(["strict", "balanced", "lenient"] as const, {
          description: "Relevance threshold. 'strict' = fewer but more relevant. 'balanced' (default). 'lenient' = broader coverage.",
        })
      ),
      count: Type.Optional(
        Type.Number({
          minimum: 1,
          maximum: 50,
          default: 20,
          description: "Maximum search results to consider (default: 20). More = broader but slower.",
        })
      ),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      if (signal?.aborted) {
        return { content: [{ type: "text", text: "Search cancelled." }], details: undefined as unknown };
      }

      // ------------------------------------------------------------------
      // Resolve search provider
      // ------------------------------------------------------------------
      const provider = resolveSearchProvider();
      if (!provider) {
        return {
          content: [{ type: "text", text: "search_and_read unavailable: No search API key is set. Use secure_env_collect to set TAVILY_API_KEY, BRAVE_API_KEY, or OLLAMA_API_KEY." }],
          isError: true,
          details: { errorKind: "auth_error", error: "No search API key set" } satisfies Partial<LLMContextDetails>,
        };
      }

      const maxTokens = params.maxTokens ?? 8192;
      const maxUrls = params.maxUrls ?? 10;
      const threshold = params.threshold ?? "balanced";
      const count = params.count ?? 20;

      // ------------------------------------------------------------------
      // Cache lookup (provider-prefixed key)
      // ------------------------------------------------------------------
      const cacheKey = normalizeQuery(params.query) + `|t:${maxTokens}|u:${maxUrls}|th:${threshold}|c:${count}|p:${provider}`;
      const cached = contextCache.get(cacheKey);

      if (cached) {
        const output = formatLLMContext(params.query, cached.grounding, cached.sources, {
          cached: true,
          tokenCount: cached.estimatedTokens,
        });

        const truncation = truncateHead(output, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
        let content = truncation.content;
        if (truncation.truncated) {
          const tempFile = await (pi as any).writeTempFile(output, { prefix: "llm-context-" });
          content += `\n\n[Truncated. Full content: ${tempFile}]`;
        }

        const totalSnippets = cached.grounding.reduce((sum, g) => sum + g.snippets.length, 0);
        const details: LLMContextDetails = {
          query: params.query,
          sourceCount: cached.grounding.length,
          snippetCount: totalSnippets,
          estimatedTokens: cached.estimatedTokens,
          cached: true,
          threshold,
          maxTokens,
          provider,
        };

        return { content: [{ type: "text", text: content }], details };
      }

      onUpdate?.({ content: [{ type: "text", text: `Searching & reading about "${params.query}"...` }], details: undefined as unknown });

      try {
        // ------------------------------------------------------------------
        // Provider-specific fetch
        // ------------------------------------------------------------------
        let result: CachedLLMContext;
        let latencyMs: number | undefined;
        let rateLimit: RateLimitInfo | undefined;

        if (provider === "combosearch") {
          const comboResult = await executeComboLLMContext(
            { query: params.query, maxTokens, maxUrls, threshold, count },
            signal,
          );
          result = comboResult.cached;
          latencyMs = comboResult.latencyMs;
          rateLimit = comboResult.rateLimit;
        } else if (provider === "tavily") {
          const tavilyResult = await executeTavilyLLMContext(
            { query: params.query, maxTokens, maxUrls, threshold, count },
            signal,
          );
          result = tavilyResult.cached;
          latencyMs = tavilyResult.latencyMs;
          rateLimit = tavilyResult.rateLimit;
        } else if (provider === "ollama") {
          const ollamaResult = await executeOllamaLLMContext(
            { query: params.query, maxTokens, count, threshold },
            signal,
          );
          result = ollamaResult.cached;
          latencyMs = ollamaResult.latencyMs;
          rateLimit = ollamaResult.rateLimit;
        } else {
          let braveResult;
          try {
            braveResult = await executeBraveLLMContext(
              { query: params.query, maxTokens, maxUrls, threshold, count },
              signal,
            );
          } catch (fetchErr) {
            // Try to extract Brave's structured error detail from the response body.
            // This is especially useful for plan/subscription errors (OPTION_NOT_IN_PLAN).
            let errorMessage: string | undefined;
            let errorKindOverride: string | undefined;
            if (fetchErr instanceof HttpError && fetchErr.response) {
              try {
                const body = await fetchErr.response.clone().json().catch(() => null);
                if (body?.error?.detail) {
                  errorMessage = body.error.detail;
                  if (body.error.code === "OPTION_NOT_IN_PLAN") {
                    errorKindOverride = "plan_error";
                    errorMessage = `LLM Context API not available on your current Brave plan. ${body.error.detail} Upgrade at https://api-dashboard.search.brave.com/app/subscriptions — or use search-the-web + fetch_page as an alternative.`;
                  }
                }
              } catch { /* body already consumed or parse error — use generic message */ }
            }
            const classified = classifyError(fetchErr);
            const message = errorMessage || classified.message;
            return {
              content: [{ type: "text", text: `search_and_read unavailable: ${message}` }],
              details: {
                errorKind: errorKindOverride || classified.kind,
                error: message,
                retryAfterMs: classified.retryAfterMs,
                query: params.query,
                provider,
              } satisfies Partial<LLMContextDetails>,
              isError: true,
            };
          }
          result = braveResult.cached;
          latencyMs = braveResult.latencyMs;
          rateLimit = braveResult.rateLimit;
        }

        // ------------------------------------------------------------------
        // Shared post-fetch: cache, format, truncate, return
        // ------------------------------------------------------------------
        contextCache.set(cacheKey, result);

        const output = formatLLMContext(params.query, result.grounding, result.sources, {
          tokenCount: result.estimatedTokens,
        });

        const truncation = truncateHead(output, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
        let content = truncation.content;

        if (truncation.truncated) {
          const tempFile = await (pi as any).writeTempFile(output, { prefix: "llm-context-" });
          content += `\n\n[Truncated. Full content: ${tempFile}]`;
        }

        const totalSnippets = result.grounding.reduce((sum, g) => sum + g.snippets.length, 0);
        const details: LLMContextDetails = {
          query: params.query,
          sourceCount: result.grounding.length,
          snippetCount: totalSnippets,
          estimatedTokens: result.estimatedTokens,
          cached: false,
          latencyMs,
          rateLimit,
          threshold,
          maxTokens,
          provider,
        };

        return { content: [{ type: "text", text: content }], details };
      } catch (error) {
        const classified = classifyError(error);
        return {
          content: [{ type: "text", text: `Search failed: ${classified.message}` }],
          details: {
            errorKind: classified.kind,
            error: classified.message,
            query: params.query,
            provider,
          } satisfies Partial<LLMContextDetails>,
          isError: true,
        };
      }
    },

    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("search_and_read "));
      text += theme.fg("muted", `"${args.query}"`);

      const meta: string[] = [];
      if (args.maxTokens && args.maxTokens !== 8192) meta.push(`${(args.maxTokens / 1000).toFixed(0)}k tokens`);
      if (args.threshold && args.threshold !== "balanced") meta.push(`threshold:${args.threshold}`);
      if (args.maxUrls && args.maxUrls !== 10) meta.push(`${args.maxUrls} urls`);
      if (meta.length > 0) {
        text += " " + theme.fg("dim", `(${meta.join(", ")})`);
      }

      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded }, theme) {
      const details = result.details as LLMContextDetails | undefined;
      if (details?.errorKind || details?.error) {
        const kindTag = details.errorKind ? theme.fg("dim", ` [${details.errorKind}]`) : "";
        return new Text(theme.fg("error", `✗ ${details.error ?? "Search failed"}`) + kindTag, 0, 0);
      }

      const providerTag = details?.provider ? theme.fg("dim", ` [${details.provider}]`) : "";
      const cacheTag = details?.cached ? theme.fg("dim", " [cached]") : "";
      const latencyTag = details?.latencyMs ? theme.fg("dim", ` ${details.latencyMs}ms`) : "";
      const tokenTag = details?.estimatedTokens
        ? theme.fg("dim", ` ~${(details.estimatedTokens / 1000).toFixed(1)}k tokens`)
        : "";

      let text = theme.fg("success",
        `✓ ${details?.sourceCount ?? 0} sources, ${details?.snippetCount ?? 0} snippets for "${details?.query}"`) +
        providerTag + tokenTag + cacheTag + latencyTag;

      if (expanded && result.content[0]?.type === "text") {
        const preview = result.content[0].text.split("\n").slice(0, 10).join("\n");
        text += "\n\n" + theme.fg("dim", preview);
      }

      return new Text(text, 0, 0);
    },
  });
}
