# x402-news-wire

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![x402](https://img.shields.io/badge/payments-x402-0052ff.svg)](https://x402.org)
[![USDC on Base](https://img.shields.io/badge/USDC-Base-0052ff.svg)](https://base.org)
[![USDC on Solana](https://img.shields.io/badge/USDC-Solana-14f195.svg)](https://solana.com)

**Global news query service over GDELT — article sets, timelines, and delta
pulses, per query.** One HTTP call, $0.003 in USDC on Base *or* Solana, and the
matching articles come back in the response body: title, URL, domain, language,
source country, and the timestamp GDELT first saw them.

Docs site: **https://nirholas.github.io/x402-news-wire/**

## Why x402 for this

News monitoring is bursty and unpredictable — an agent tracking a story wants
fifty pulses this hour and nothing tomorrow. Monthly media-monitoring seats and
API-key quotas price that badly in both directions. x402 lets the route quote
its own price per call: $0.003 for a full query, $0.002 for a delta pulse, paid
in USDC on whichever chain the agent holds funds on, with no account to create
and no key to rotate. Pay-per-poll is also the honest shape for a watch loop —
you pay for each look, and each look returns a real answer rather than a
subscription you have to remember to cancel.

## Quickstart

```bash
git clone https://github.com/nirholas/x402-news-wire
cd x402-news-wire
npm install
npm run dev            # http://localhost:4022 — no configuration needed
```

See the price with no wallet at all:

```bash
curl -s "http://localhost:4022/query?q=semiconductor%20export%20controls&timespan=3d&maxRecords=25" | jq
# 402 + accepts: [ USDC on Base, USDC on Solana ]
```

Then buy it, from an agent (wallet funded with Base Sepolia USDC —
https://faucet.circle.com):

```bash
PRIVATE_KEY=0xYourTestKey npm run client
```

## API

| Route | Price | What you get back |
|-------|-------|-------------------|
| `GET /query` | **$0.003** | Matching articles (title, URL, domain, language, source country, seen date) and a coverage-volume timeline over the timespan |
| `GET /pulse` | **$0.002** | New articles since the caller's cursor, a `nextCursor` for the following poll, and a `truncated` flag |
| `GET /` | free | Service metadata, live prices, active payment rails, upstream status |
| `GET /health` | free | Liveness probe |
| `GET /.well-known/x402` | free | Machine-readable discovery manifest |
| `GET /skill.md` | free | This agent skill card |
| `GET /openapi.json` | free | OpenAPI 3.1 spec |

Full reference: [docs/api.md](docs/api.md) · [openapi.json](openapi.json)

## How x402 works

**Pay in USDC on Base or Solana — your client picks the rail.**

1. **402** — the route, called without payment, replies HTTP 402 with an
   `accepts` array holding **both** rails: exact price
   ($0.003 → `3000` USDC base units), asset, and `payTo`.
2. **Sign** — on Base, the client signs an EIP-3009 USDC authorization (no gas
   from the payer). On Solana, it signs an SPL `transferChecked` whose fee payer
   is the facilitator's sponsor account (so the buyer needs USDC only, no SOL).
3. **Settle** — the server hands the payload to the facilitator
   (`https://x402.org/facilitator`), which verifies and settles on the chosen chain.
4. **200** — the same request returns the artifact in the body, with the
   settlement receipt in the `X-PAYMENT-RESPONSE` header.

| Rail | Network | Asset | payTo |
|------|---------|-------|-------|
| EVM | `base-sepolia` (`base` on mainnet) | USDC | `0x40252CFDF8B20Ed757D61ff157719F33Ec332402` |
| Solana | `solana` (`solana-devnet` on devnet) | USDC | `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW` |

Those are the suite's public receive addresses and the server's defaults. Set
`PAY_TO_ADDRESS` / `SOLANA_PAY_TO_ADDRESS` to be paid yourself.

Walkthroughs: [examples/curl.md](examples/curl.md) ·
[examples/agent-client.ts](examples/agent-client.ts) ·
[docs/tutorial.md](docs/tutorial.md)

## Real backend / API keys

| Env | Effect |
|-----|--------|
| *(nothing)* | GDELT is keyless and is called live out of the box. `npm install && npm run dev` queries real worldwide news coverage. |
| `GDELT_MIN_GAP_MS` | Milliseconds between upstream calls (default `5100`). Raise it if you share an egress IP with other GDELT users and see frequent throttling. |

All variables: [.env.example](.env.example)

## For AI agents

- **[skill.md](skill.md)** — agent-facing skill file: endpoints, prices,
  schemas, both payment rails. Point your agent at it.
- **`GET /.well-known/x402`** — discovery manifest listing every resource with
  both networks. Indexable by [x402scan.com](https://x402scan.com), the x402
  Bazaar, and [agentic.market](https://agentic.market).
- **MCP** — [examples/mcp-tool.md](examples/mcp-tool.md) exposes these routes as
  Claude MCP tools, with per-wallet spend caps and a
  `claude_desktop_config.json` example.
- More: [docs/agents.md](docs/agents.md)

## Docs

- Landing: https://nirholas.github.io/x402-news-wire/
- [Tutorial](docs/tutorial.md) · [API reference](docs/api.md) · [For AI agents](docs/agents.md)

## Support

Questions, bugs, or a listing request: **nichxbt@gmail.com** ·
[open an issue](https://github.com/nirholas/x402-news-wire/issues)

## License

Apache-2.0. Part of the [x402 Suite](https://github.com/nirholas/x402-suite).
