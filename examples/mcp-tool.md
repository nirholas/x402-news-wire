# Exposing x402-news-wire as an MCP tool

[MCP](https://modelcontextprotocol.io) lets Claude (and other MCP clients) call
this service directly. The wrapper below holds the wallet, pays the x402
invoice, and hands the artifact straight back to the model.

## Minimal server

```ts
// mcp-x402-news-wire.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createSigner, wrapFetchWithPayment } from "x402-fetch";
import { z } from "zod";

const BASE_URL = process.env.NEWS_WIRE_URL ?? "http://localhost:4022";

const signer = await createSigner("base-sepolia", process.env.PRIVATE_KEY!);
const payFetch = wrapFetchWithPayment(fetch, signer);

const server = new McpServer({ name: "x402-news-wire", version: "0.1.0" });

server.tool(
  "query_news",
  "Search worldwide news coverage and get the matching articles plus a volume timeline",
  {
    q: z.string().describe("Search terms. Multi-word free text is quoted automatically; GDELT operators (`AND`, `OR`, `\"…\"`, `domain:`, `tone<`) are passed through untouched."),
    timespan: z.string().optional().describe("GDELT timespan looking back from now — `15min`, `1h`, `1d`, `3d`, `1w`, `2months`. Default `3d`."),
    maxRecords: z.number().optional().describe("Articles to return, 1–75. Default 25."),
    sourceLang: z.string().optional().describe("Restrict to a source language, e.g. `english`, `spanish`, `japanese`."),
    sourceCountry: z.string().optional().describe("Restrict to a publishing country, e.g. `japan`, `germany`, `unitedstates`."),
    timeline: z.string().optional().describe("Set `false` to skip the timeline call. Faster and less likely to hit GDELT's throttle. Default `true`."),
  },
  async (args) => {
    const url = new URL(`${BASE_URL}/query`);
    url.searchParams.set("q", args.q);
    if (args.timespan) url.searchParams.set("timespan", args.timespan);
    if (args.maxRecords) url.searchParams.set("maxRecords", String(args.maxRecords));
    if (args.sourceCountry) url.searchParams.set("sourceCountry", args.sourceCountry);
    const res = await payFetch(url);
    if (!res.ok) throw new Error(`GET /query → ${res.status}`);
    return { content: [{ type: "text", text: JSON.stringify(await res.json(), null, 2) }] };
  },
);

server.tool(
  "news_pulse",
  "Only the articles indexed since your cursor, plus a fresh cursor",
  {
    q: z.string().describe("Search terms, same syntax as `/query`."),
    cursor: z.string().describe("Where to resume from: GDELT's `YYYYMMDDHHMMSS` or any ISO-8601 timestamp. Use the `nextCursor` from your previous pulse."),
    maxRecords: z.number().optional().describe("Articles to return, 1–75. Default 50."),
  },
  async (args) => {
    const url = new URL(`${BASE_URL}/pulse`);
    url.searchParams.set("q", args.q);
    url.searchParams.set("cursor", args.cursor);
    if (args.maxRecords) url.searchParams.set("maxRecords", String(args.maxRecords));
    const res = await payFetch(url);
    if (!res.ok) throw new Error(`GET /pulse → ${res.status}`);
    return { content: [{ type: "text", text: JSON.stringify(await res.json(), null, 2) }] };
  },
);

await server.connect(new StdioServerTransport());
```

## Wire it into Claude Desktop

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "x402-news-wire": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/mcp-x402-news-wire.ts"],
      "env": {
        "PRIVATE_KEY": "0xYourFundedTestKey",
        "NEWS_WIRE_URL": "http://localhost:4022"
      }
    }
  }
}
```

## Spending caps

Each GET /query call costs $0.003. Wrap `payFetch` with a
budget so a runaway loop cannot drain the wallet:

```ts
let spentMicros = 0;
const CAP_MICROS = 1_000_000; // $1.00

const cappedFetch: typeof fetch = async (input, init) => {
  if (spentMicros >= CAP_MICROS) throw new Error("x402 spend cap reached");
  const res = await payFetch(input, init);
  const receipt = res.headers.get("X-PAYMENT-RESPONSE");
  if (receipt) {
    const { amount } = JSON.parse(Buffer.from(receipt, "base64").toString());
    spentMicros += Number(amount ?? 0);
  }
  return res;
};
```

## Notes

- The tool descriptions above come from [`skill.md`](../skill.md) — keep them in
  sync so the model knows exactly what it is buying.
- Paying on Solana instead? Swap `x402-fetch` for a Solana x402 client; the 402
  challenge already advertises the `solana` rail, so nothing on this
  server changes.
- Discovery for autonomous agents: [`/.well-known/x402`](../public/.well-known/x402).
