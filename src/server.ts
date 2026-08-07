/**
 * x402-news-wire — Express server with the dual-rail x402 paywall.
 *
 * Paid routes return the purchased artifact directly in the 200 response body.
 * Buyers pay in USDC on Base (EVM) or on Solana; the 402 challenge advertises
 * both rails and the client picks.
 */
import "dotenv/config";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import {
  facilitatorUrl,
  paywall,
  rails,
  solanaCheckoutRouter,
  usingSuiteDefaultPayTo,
  type RoutePrices,
} from "./payments.js";
import { GdeltThrottledError, minGapMs, pulse, query } from "./service.js";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const publicDir = join(root, "public");

/** Paid routes. Anything not listed here is free. */
const ROUTES: RoutePrices = {
  "GET /query": {
    price: "$0.003",
    description:
      "Global news search over GDELT. Returns matching articles (title, URL, domain, language, source country, seen date) plus a coverage-volume timeline.",
    outputSchema: {
      type: "object",
      properties: {
        count: { type: "integer" },
        articles: { type: "array", items: { type: "object" } },
        volumeTimeline: { type: ["array", "null"] },
      },
    },
  },
  "GET /pulse": {
    price: "$0.002",
    description:
      "Delta pulse: only the articles GDELT indexed since your cursor, plus a fresh cursor for the next poll.",
    outputSchema: {
      type: "object",
      properties: {
        newArticleCount: { type: "integer" },
        nextCursor: { type: "string" },
        articles: { type: "array", items: { type: "object" } },
      },
    },
  },
};

const app = express();
app.disable("x-powered-by");
app.use(express.json());

// Dual-rail x402 paywall: USDC on Base or Solana.
app.use(paywall(ROUTES, { service: "x402-news-wire" }));

// Optional: browser (Phantom) Solana checkout helper. No-op when the modal
// package is not installed — agent clients never need it.
const checkoutRouter = await solanaCheckoutRouter();
if (checkoutRouter) app.use("/api/x402-checkout", checkoutRouter);

// Discovery manifest — registered before express.static so it keeps an explicit
// application/json content type (the file has no extension).
app.get("/.well-known/x402", (_req, res) => {
  res.type("application/json").sendFile(join(publicDir, ".well-known", "x402"));
});

// Agent-facing contract and machine spec, served from the repo root.
app.get("/skill.md", (_req, res) => {
  res.type("text/markdown").sendFile(join(root, "skill.md"));
});
app.get("/openapi.json", (_req, res) => {
  res.type("application/json").sendFile(join(root, "openapi.json"));
});

// Static site.
app.use(express.static(publicDir));

// Free: service info.
app.get("/", (_req, res) => {
  res.json({
    name: "x402-news-wire",
    description:
      "Global news query service over GDELT — article sets, timelines, and delta pulses, per query",
    payment: {
      protocol: "x402",
      note: "Pay in USDC on Base or Solana — your client picks the rail.",
      facilitator: facilitatorUrl(),
      rails: rails(),
    },
    backend: {
      source: "gdelt-doc-2.0",
      live: true,
      keyless: true,
      minGapMs: minGapMs(),
      note: "GDELT allows roughly one request every 5 seconds per IP. Upstream calls are serialized and retried with backoff; a surviving throttle returns 503 gdelt_throttled with Retry-After.",
    },
    routes: {
      "GET /query": {
        price: "$0.003",
        params: "q (required), timespan, maxRecords (1-75), sourceLang, sourceCountry, timeline",
        returns: "matching articles + coverage-volume timeline",
      },
      "GET /pulse": {
        price: "$0.002",
        params: "q (required), cursor (required), maxRecords (1-75)",
        returns: "articles indexed since the cursor + a fresh nextCursor",
      },
      "GET /health": { price: "free" },
      "GET /.well-known/x402": { price: "free" },
      "GET /skill.md": { price: "free" },
      "GET /openapi.json": { price: "free" },
    },
    docs: "https://nirholas.github.io/x402-news-wire/",
    skill: "https://github.com/nirholas/x402-news-wire/blob/main/skill.md",
  });
});

// Free: health check.
app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

/** Map an upstream failure onto an honest HTTP status. Nothing settles on 4xx/5xx. */
function sendUpstreamError(res: express.Response, err: unknown): void {
  if (err instanceof GdeltThrottledError) {
    res.setHeader("Retry-After", String(err.retryAfterSeconds));
    res.status(503).json({ error: "gdelt_throttled", message: err.message });
    return;
  }
  res.status(502).json({
    error: "upstream_error",
    message: err instanceof Error ? err.message : "GDELT request failed",
  });
}

function readMaxRecords(raw: unknown, fallback: number): number | null {
  if (raw == null) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > 75) return null;
  return Math.floor(n);
}

// Paid: $0.003 — news query. Artifact returned in this response body.
app.get("/query", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) {
    res.status(400).json({
      error: "missing_query",
      message: "Query param 'q' is required, e.g. /query?q=semiconductor%20export%20controls",
    });
    return;
  }
  const maxRecords = readMaxRecords(req.query.maxRecords, 25);
  if (maxRecords === null) {
    res.status(400).json({
      error: "invalid_max_records",
      message: "Query param 'maxRecords' must be a number between 1 and 75.",
    });
    return;
  }
  try {
    res.json(
      await query(q, {
        timespan: req.query.timespan ? String(req.query.timespan) : undefined,
        maxRecords,
        sourceLang: req.query.sourceLang ? String(req.query.sourceLang) : undefined,
        sourceCountry: req.query.sourceCountry ? String(req.query.sourceCountry) : undefined,
        includeTimeline: String(req.query.timeline ?? "true") !== "false",
      }),
    );
  } catch (err) {
    sendUpstreamError(res, err);
  }
});

// Paid: $0.002 — delta pulse. Artifact returned in this response body.
app.get("/pulse", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) {
    res.status(400).json({ error: "missing_query", message: "Query param 'q' is required." });
    return;
  }
  const cursor = String(req.query.cursor ?? "").trim();
  if (!cursor) {
    res.status(400).json({
      error: "missing_cursor",
      message:
        "Query param 'cursor' is required — GDELT format YYYYMMDDHHMMSS or an ISO-8601 timestamp. Use the nextCursor from your previous pulse.",
    });
    return;
  }
  const maxRecords = readMaxRecords(req.query.maxRecords, 50);
  if (maxRecords === null) {
    res.status(400).json({
      error: "invalid_max_records",
      message: "Query param 'maxRecords' must be a number between 1 and 75.",
    });
    return;
  }
  try {
    res.json(await pulse(q, cursor, maxRecords));
  } catch (err) {
    if (err instanceof Error && /Invalid cursor/.test(err.message)) {
      res.status(400).json({ error: "invalid_cursor", message: err.message });
      return;
    }
    sendUpstreamError(res, err);
  }
});

// Unknown route.
app.use((_req, res) => {
  res.status(404).json({ error: "not_found", docs: "https://nirholas.github.io/x402-news-wire/" });
});

const port = Number(process.env.PORT ?? 4022);
app.listen(port, () => {
  const pkg = require("../package.json") as { version: string };
  console.log(`x402-news-wire v${pkg.version} listening on :${port}`);
  console.log("  payment rails:");
  for (const rail of rails()) {
    console.log(
      `    ${rail.rail === "evm" ? "EVM   " : "Solana"}  ${rail.network.padEnd(14)} ${rail.asset} → ${rail.payTo}`,
    );
  }
  console.log(`  facilitator: ${facilitatorUrl()}`);
  if (usingSuiteDefaultPayTo()) {
    console.log(
      "  note:        using suite default payTo — set PAY_TO_ADDRESS/SOLANA_PAY_TO_ADDRESS to receive funds yourself",
    );
  }
  console.log(`  backend:     GDELT DOC 2.0 (keyless, live) — min gap ${minGapMs()}ms`);
  console.log("  paid routes:");
  for (const [route, spec] of Object.entries(ROUTES)) {
    console.log(`    ${route.padEnd(28)} ${typeof spec === "string" ? spec : spec.price}`);
  }
  console.log("  free routes: GET /, GET /health, GET /.well-known/x402, GET /skill.md");
});
