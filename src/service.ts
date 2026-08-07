/**
 * x402-news-wire — service layer.
 *
 * Live, keyless global news data from the GDELT Project's DOC 2.0 API
 * (https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/). GDELT monitors
 * worldwide news media in 65+ languages, updated every 15 minutes.
 *
 * GDELT enforces roughly one request per 5 seconds per IP and returns a
 * plain-text notice (HTTP 200) when throttled. All calls go through a
 * serialized queue that spaces requests >= 5.1s apart, and throttle notices
 * are surfaced as structured 429-style errors instead of garbage JSON.
 */

const GDELT = "https://api.gdeltproject.org/api/v2/doc/doc";
const UA = "x402-news-wire/0.1.0 (https://github.com/nirholas/x402-news-wire)";
/** Minimum gap between upstream GDELT calls. Raise via GDELT_MIN_GAP_MS on busy egress IPs. */
const MIN_GAP_MS = Math.max(Number(process.env.GDELT_MIN_GAP_MS) || 5_100, 1_000);

/** The configured throttle gap, for the service-info route and startup banner. */
export function minGapMs(): number {
  return MIN_GAP_MS;
}
const TIMEOUT_MS = 20_000;
/** GDELT throttles hard from shared egress IPs. Retry a throttled call this many times. */
const THROTTLE_RETRIES = 2;
const RETRY_BACKOFF_MS = 6_000;

export class GdeltThrottledError extends Error {
  /** Seconds the caller should wait before retrying — surfaced as `Retry-After`. */
  readonly retryAfterSeconds = 10;
  constructor() {
    super(
      "GDELT is rate-limiting this server's IP (it allows roughly one request every 5 seconds). " +
        "Retry shortly, or run this service from a less contended egress address.",
    );
    this.name = "GdeltThrottledError";
  }
}

/* Serialize GDELT calls with a minimum gap between requests. */
let queue: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastCallAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      return await fn();
    } finally {
      lastCallAt = Date.now();
    }
  });
  queue = run.catch(() => undefined);
  return run;
}

async function gdeltOnce(params: Record<string, string>): Promise<Record<string, any>> {
  return throttled(async () => {
    const url = `${GDELT}?${new URLSearchParams({ format: "json", ...params })}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // GDELT signals throttling two ways: a real 429, or a plain-text notice
    // served with HTTP 200. Both become the same structured error.
    if (res.status === 429 || res.status === 503) throw new GdeltThrottledError();
    const text = await res.text();
    if (!res.ok) throw new Error(`GDELT HTTP ${res.status}`);
    if (/limit requests|rate limit/i.test(text) && !text.trimStart().startsWith("{")) {
      throw new GdeltThrottledError();
    }
    try {
      return JSON.parse(text) as Record<string, any>;
    } catch {
      // GDELT reports query errors as plain text with HTTP 200.
      throw new Error(`GDELT: ${text.trim().slice(0, 300) || "empty response"}`);
    }
  });
}

/** Same as `gdeltOnce`, with bounded backoff retries when GDELT throttles us. */
async function gdelt(params: Record<string, string>): Promise<Record<string, any>> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= THROTTLE_RETRIES; attempt++) {
    try {
      return await gdeltOnce(params);
    } catch (err) {
      lastErr = err;
      if (!(err instanceof GdeltThrottledError) || attempt === THROTTLE_RETRIES) throw err;
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS * (attempt + 1)));
    }
  }
  throw lastErr;
}

/**
 * GDELT requires multi-word free text to be quoted (otherwise it errors with
 * "too short or too common"). Leave queries with explicit operators alone.
 */
function normalizeQuery(q: string): string {
  const hasOperators = /["():]|(\b(AND|OR|NOT)\b)|(\w+:)/.test(q);
  if (hasOperators || !q.includes(" ")) return q;
  return `"${q}"`;
}

export interface Article {
  title: string;
  url: string;
  domain: string;
  language: string;
  sourceCountry: string;
  seenDate: string;
  socialImage: string | null;
}

function mapArticles(raw: Array<Record<string, any>>): Article[] {
  return raw.map((a) => ({
    title: a.title ?? "",
    url: a.url ?? "",
    domain: a.domain ?? "",
    language: a.language ?? "",
    sourceCountry: a.sourcecountry ?? "",
    seenDate: a.seendate ?? "",
    socialImage: a.socialimage || null,
  }));
}

function mapTimeline(raw: Record<string, any>): Array<{ date: string; value: number }> | null {
  const series = raw?.timeline?.[0]?.data;
  if (!Array.isArray(series)) return null;
  return series.map((p: Record<string, any>) => ({
    date: p.date ?? "",
    value: typeof p.value === "number" ? p.value : Number(p.value ?? 0),
  }));
}

/** GDELT datetime format: YYYYMMDDHHMMSS (UTC). */
export function toGdeltDate(d: Date): string {
  return d.toISOString().replace(/[-:T]/g, "").slice(0, 14);
}

function parseCursor(cursor: string): string {
  if (/^\d{14}$/.test(cursor)) return cursor;
  const d = new Date(cursor);
  if (Number.isNaN(d.getTime())) {
    throw new Error(
      `Invalid cursor "${cursor}". Use GDELT format YYYYMMDDHHMMSS or an ISO-8601 timestamp.`,
    );
  }
  return toGdeltDate(d);
}

/* ────────────────────────── query ────────────────────────── */

export interface QueryOptions {
  timespan?: string; // e.g. 1d, 3d, 1w, 2months — GDELT timespan syntax
  maxRecords?: number;
  sourceLang?: string;
  sourceCountry?: string;
  includeTimeline?: boolean;
}

export async function query(q: string, opts: QueryOptions = {}) {
  const nq = normalizeQuery(q);
  const timespan = opts.timespan ?? "3d";
  const max = Math.min(Math.max(opts.maxRecords ?? 25, 1), 75);
  let fullQuery = nq;
  if (opts.sourceLang) fullQuery += ` sourcelang:${opts.sourceLang}`;
  if (opts.sourceCountry) fullQuery += ` sourcecountry:${opts.sourceCountry}`;

  const artData = await gdelt({
    query: fullQuery,
    mode: "artlist",
    maxrecords: String(max),
    timespan,
    sort: "datedesc",
  });
  const articles = mapArticles(artData.articles ?? []);

  // Timeline is a second GDELT call (throttle-spaced). A failure here
  // degrades gracefully instead of losing the article set.
  let timeline: Array<{ date: string; value: number }> | null = null;
  let timelineStatus = "ok";
  if (opts.includeTimeline !== false) {
    try {
      const tlData = await gdelt({ query: fullQuery, mode: "timelinevolraw", timespan });
      timeline = mapTimeline(tlData);
    } catch (err) {
      timelineStatus = `unavailable: ${(err as Error).message}`;
    }
  } else {
    timelineStatus = "skipped (timeline=false)";
  }

  return {
    query: q,
    effectiveQuery: fullQuery,
    timespan,
    count: articles.length,
    articles,
    volumeTimeline: timeline,
    timelineStatus,
    source: "gdelt-doc-2.0",
    retrievedAt: new Date().toISOString(),
  };
}

/* ────────────────────────── pulse ────────────────────────── */

export async function pulse(q: string, cursor: string, maxRecords = 50) {
  const since = parseCursor(cursor);
  const now = new Date();
  // GDELT indexes with ~15 min latency; leave a 60s guard so the next cursor
  // never skips articles still being ingested.
  const nextCursor = toGdeltDate(new Date(now.getTime() - 60_000));
  const max = Math.min(Math.max(maxRecords, 1), 75);

  const data = await gdelt({
    query: normalizeQuery(q),
    mode: "artlist",
    maxrecords: String(max),
    startdatetime: since,
    enddatetime: toGdeltDate(now),
    sort: "datedesc",
  });
  const articles = mapArticles(data.articles ?? []);

  return {
    query: q,
    cursor: since,
    nextCursor,
    newArticleCount: articles.length,
    truncated: articles.length >= max,
    articles,
    source: "gdelt-doc-2.0",
    retrievedAt: now.toISOString(),
  };
}
