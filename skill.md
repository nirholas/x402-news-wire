# x402-news-wire — agent skill

Search worldwide news coverage and get the articles back in the same response.
`/query` runs a GDELT DOC 2.0 search over a timespan and returns the matching
article set plus a coverage-volume timeline showing how attention rose and fell.
`/pulse` is the watch-loop route: hand it the `nextCursor` from your last call
and it returns only the articles indexed since then, plus a fresh cursor. GDELT
monitors news media in 65+ languages and updates every 15 minutes; it is keyless
and queried live on every request.

**Base URL:** `{BASE_URL}` (local default `http://localhost:4022`)

Every paid call returns the purchased artifact **in the 200 response body**.
There is nothing to poll and nothing to collect later.

## Payment

This service speaks **x402** (HTTP 402 Payment Required, <https://x402.org>).

**Pay in USDC on Base or Solana — your client picks the rail.**

| Rail | Network | Asset | payTo |
|------|---------|-------|-------|
| EVM | `base-sepolia` (`base` on mainnet) | USDC | `0x40252CFDF8B20Ed757D61ff157719F33Ec332402` |
| Solana | `solana` (`solana-devnet` on devnet) | USDC | `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW` |

Facilitator: `https://x402.org/facilitator` (verifies and settles both rails).

Flow:

1. Call the endpoint with no `X-PAYMENT` header. You get **402** with an
   `accepts` array holding **both** rails.
2. Pick a rail, sign the payment, and put the base64 payload in `X-PAYMENT`.
3. Repeat the request. You get **200** with the artifact, and a settlement
   receipt in the `X-PAYMENT-RESPONSE` header (base64 JSON:
   `{ success, rail, network, transaction, payer, amount, asset }`).

Use `x402-fetch` (EVM), a Solana x402 client, or any x402-aware HTTP client —
the wire format is the standard one.

```ts
import { wrapFetchWithPayment, createSigner } from "x402-fetch";
const signer = await createSigner("base-sepolia", process.env.PRIVATE_KEY!);
const pay = wrapFetchWithPayment(fetch, signer);
const res = await pay("{BASE_URL}/query?q=semiconductor%20export%20controls&timespan=3d&maxRecords=25");
const artifact = await res.json();
```

## Endpoints

### `GET /query` — $0.003

Search worldwide news coverage and get the matching articles plus a volume timeline

| Param | In | Required | Type | Description |
|-------|----|----------|------|-------------|
| `q` | query | yes | string | Search terms. Multi-word free text is quoted automatically; GDELT operators (`AND`, `OR`, `"…"`, `domain:`, `tone<`) are passed through untouched. |
| `timespan` | query | no | string | GDELT timespan looking back from now — `15min`, `1h`, `1d`, `3d`, `1w`, `2months`. Default `3d`. |
| `maxRecords` | query | no | integer | Articles to return, 1–75. Default 25. |
| `sourceLang` | query | no | string | Restrict to a source language, e.g. `english`, `spanish`, `japanese`. |
| `sourceCountry` | query | no | string | Restrict to a publishing country, e.g. `japan`, `germany`, `unitedstates`. |
| `timeline` | query | no | string | Set `false` to skip the timeline call. Faster and less likely to hit GDELT's throttle. Default `true`. |

**Returns** (`200 application/json`) — Matching articles (title, URL, domain, language, source country, seen date) and a coverage-volume timeline over the timespan

```json
{
  "query": "semiconductor export controls",
  "effectiveQuery": "\"semiconductor export controls\"",
  "timespan": "3d",
  "count": 3,
  "articles": [
    {
      "title": "Tokyo weighs fresh curbs on chipmaking tool exports",
      "url": "https://www.japantimes.co.jp/business/2026/08/07/chip-tool-export-curbs/",
      "domain": "japantimes.co.jp",
      "language": "English",
      "sourceCountry": "Japan",
      "seenDate": "20260807T021500Z",
      "socialImage": "https://www.japantimes.co.jp/uploads/2026/08/chip-tools.jpg"
    },
    {
      "title": "Chip industry groups warn of supply disruption from new export rules",
      "url": "https://www.reuters.com/technology/chip-export-rules-2026-08-06/",
      "domain": "reuters.com",
      "language": "English",
      "sourceCountry": "United Kingdom",
      "seenDate": "20260806T184500Z",
      "socialImage": null
    },
    {
      "title": "Halbleiter: Neue Exportkontrollen treffen Zulieferer",
      "url": "https://www.handelsblatt.com/technik/halbleiter-exportkontrollen/",
      "domain": "handelsblatt.com",
      "language": "German",
      "sourceCountry": "Germany",
      "seenDate": "20260806T093000Z",
      "socialImage": null
    }
  ],
  "volumeTimeline": [
    {
      "date": "20260804T000000Z",
      "value": 0.0041
    },
    {
      "date": "20260805T000000Z",
      "value": 0.0067
    },
    {
      "date": "20260806T000000Z",
      "value": 0.0192
    },
    {
      "date": "20260807T000000Z",
      "value": 0.0155
    }
  ],
  "timelineStatus": "ok",
  "source": "gdelt-doc-2.0",
  "retrievedAt": "2026-08-07T02:44:19.882Z"
}
```

---

### `GET /pulse` — $0.002

Only the articles indexed since your cursor, plus a fresh cursor

| Param | In | Required | Type | Description |
|-------|----|----------|------|-------------|
| `q` | query | yes | string | Search terms, same syntax as `/query`. |
| `cursor` | query | yes | string | Where to resume from: GDELT's `YYYYMMDDHHMMSS` or any ISO-8601 timestamp. Use the `nextCursor` from your previous pulse. |
| `maxRecords` | query | no | integer | Articles to return, 1–75. Default 50. |

**Returns** (`200 application/json`) — New articles since the caller's cursor, a `nextCursor` for the following poll, and a `truncated` flag

```json
{
  "query": "semiconductor export controls",
  "cursor": "20260806000000",
  "nextCursor": "20260807024319",
  "newArticleCount": 2,
  "truncated": false,
  "articles": [
    {
      "title": "Tokyo weighs fresh curbs on chipmaking tool exports",
      "url": "https://www.japantimes.co.jp/business/2026/08/07/chip-tool-export-curbs/",
      "domain": "japantimes.co.jp",
      "language": "English",
      "sourceCountry": "Japan",
      "seenDate": "20260807T021500Z",
      "socialImage": "https://www.japantimes.co.jp/uploads/2026/08/chip-tools.jpg"
    },
    {
      "title": "Chip industry groups warn of supply disruption from new export rules",
      "url": "https://www.reuters.com/technology/chip-export-rules-2026-08-06/",
      "domain": "reuters.com",
      "language": "English",
      "sourceCountry": "United Kingdom",
      "seenDate": "20260806T184500Z",
      "socialImage": null
    }
  ],
  "source": "gdelt-doc-2.0",
  "retrievedAt": "2026-08-07T02:44:19.882Z"
}
```


## Free endpoints

- `GET /` — Service metadata, live prices, active payment rails, upstream status
- `GET /health` — Liveness probe
- `GET /.well-known/x402` — Machine-readable discovery manifest
- `GET /skill.md` — This agent skill card
- `GET /openapi.json` — OpenAPI 3.1 spec

## Error codes

| HTTP | `error` | Meaning |
|------|---------|---------|
| 400 | `missing_query` | `q` was not supplied. |
| 400 | `missing_cursor` | `GET /pulse` called without `cursor`. |
| 400 | `invalid_cursor` | `cursor` is neither `YYYYMMDDHHMMSS` nor an ISO-8601 timestamp. |
| 400 | `invalid_max_records` | `maxRecords` outside 1…75. |
| 503 | `gdelt_throttled` | GDELT rate-limited this server after retries. `Retry-After` header included. Nothing settled. |
| 502 | `upstream_error` | GDELT failed, timed out, or rejected the query. Nothing settled. |
| 402 | — | Payment required or rejected. Body carries `accepts` (both rails) and an `error` reason. |
| 500 | `no_payment_rail_configured` | Server has neither a valid EVM nor Solana payTo. |

## Data source

One live, keyless upstream: the **[GDELT Project's DOC 2.0 API](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/)**,
which monitors worldwide news media in over 65 languages and re-indexes every 15
minutes.

GDELT rate-limits to roughly **one request every 5 seconds per IP**, so this
service serializes all upstream calls through a queue that spaces them 5.1
seconds apart and retries with backoff when throttled. A throttle that survives
the retries surfaces as `503 gdelt_throttled` with a `Retry-After` header —
never as malformed JSON. On `/query`, a failed timeline call degrades to
`volumeTimeline: null` with the reason in `timelineStatus`; you still get the
article set you paid for. There are no fixtures in this repo: every response is
live data.

## Discovery

Machine-readable manifest: **`GET /.well-known/x402`**
(also at <https://github.com/nirholas/x402-news-wire/blob/main/public/.well-known/x402>).
Indexed by [x402scan.com](https://x402scan.com), the x402 Bazaar, and
[agentic.market](https://agentic.market).

OpenAPI 3.1: [`openapi.json`](https://github.com/nirholas/x402-news-wire/blob/main/openapi.json)

## Contact

nichxbt@gmail.com · <https://github.com/nirholas/x402-news-wire>
