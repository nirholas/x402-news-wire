---
name: query-news-wire
description: Run the x402-news-wire HTTP service and call its paid routes for GDELT article searches with coverage timelines, and cursor-based delta pulses for new coverage. Use when an agent needs global news data and can pay per query in USDC over x402.
---

# x402-news-wire

x402-news-wire wraps the GDELT news index. `/query` returns an article set plus a coverage timeline, and `/pulse` returns only articles newer than a cursor so an agent can poll for changes. Results come in the 200 body. GDELT throttles callers, so the service spaces upstream calls (`GDELT_MIN_GAP_MS`, default 5100).

Paying is irreversible. Before any paid call, show the user the route, price, network and payTo address from the 402 response, and wait for an explicit yes.

## Run the service

From a clone (Node 18+):

```bash
git clone https://github.com/nirholas/x402-news-wire
cd x402-news-wire && npm install
npm run dev        # tsx src/server.ts, listens on :4022 (PORT overrides)
```

Environment (see `.env.example`): `GDELT_MIN_GAP_MS` (minimum gap between upstream GDELT calls, default 5100). Payment settings: `PAY_TO_ADDRESS` (Base receive address), `SOLANA_PAY_TO_ADDRESS`, `NETWORK` (`base-sepolia` default, or `base`), `SOLANA_NETWORK`, `FACILITATOR_URL`, `PUBLIC_BASE_URL`. Set your own pay-to addresses to be paid yourself. `npm run build` then `npm start` runs the compiled server.

## Routes

| Route | Price | Params |
|---|---|---|
| `GET /query` | $0.003 | `q` required (GDELT operators like `AND`, `OR`, `domain:` pass through); `timespan` (`15min`, `1h`, `1d`, `3d`, `1w`, `2months`, default `3d`), `maxRecords` (1-75, default 25), `sourceLang`, `sourceCountry`, `timeline` (`false` skips the timeline call) |
| `GET /pulse` | $0.002 | `q` and `cursor` required (`YYYYMMDDHHMMSS` or ISO-8601; reuse the previous response's `nextCursor`); `maxRecords` (1-75, default 50) |
| `GET /skill.md`, `GET /openapi.json` | free | capability sheet and OpenAPI spec |

## Paying

An unpaid request to a paid route returns 402 with an `accepts` array listing both rails (USDC on Base or Solana). Sign the entry your wallet supports and retry with the base64 `X-PAYMENT` header. The settlement receipt is in the `X-PAYMENT-RESPONSE` header. The reference client is `examples/agent-client.ts` (`npm run client`), which uses `x402-fetch` with `PRIVATE_KEY` for a Base Sepolia wallet and `BASE_URL` (default `http://localhost:4022`).

## Example

```bash
curl -i "localhost:4022/query?q=semiconductor%20export%20controls&timespan=1d&maxRecords=10"
# 402 first. After approval and payment: articles plus a timeline.
# Then poll cheaply: GET /pulse?q=semiconductor%20export%20controls&cursor=<nextCursor>
```
