# API reference — x402-news-wire

Base URL: `http://localhost:4022` in development.
Machine-readable: [`openapi.json`](https://github.com/nirholas/x402-news-wire/blob/main/openapi.json) (OpenAPI 3.1).

All paid routes return the purchased artifact in the **200 response body**.

## Payment

Every paid route answers an unpaid request with **402** and an `accepts` array
holding both rails:

| Rail | Network | Asset | payTo |
|------|---------|-------|-------|
| EVM | `base-sepolia` (`base` on mainnet) | USDC | `0x40252CFDF8B20Ed757D61ff157719F33Ec332402` |
| Solana | `solana` (`solana-devnet` on devnet) | USDC | `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW` |

Prices are quoted in USDC base units (6 decimals) as `maxAmountRequired`.
On success the response carries `X-PAYMENT-RESPONSE`: base64 JSON with
`{ success, rail, network, transaction, payer, amount, asset }`.

---

## `GET /query`

**$0.003** — Search worldwide news coverage and get the matching articles plus a volume timeline

### Parameters

| Param | In | Required | Type | Description |
|-------|----|----------|------|-------------|
| `q` | query | yes | string | Search terms. Multi-word free text is quoted automatically; GDELT operators (`AND`, `OR`, `"…"`, `domain:`, `tone<`) are passed through untouched. |
| `timespan` | query | no | string | GDELT timespan looking back from now — `15min`, `1h`, `1d`, `3d`, `1w`, `2months`. Default `3d`. |
| `maxRecords` | query | no | integer | Articles to return, 1–75. Default 25. |
| `sourceLang` | query | no | string | Restrict to a source language, e.g. `english`, `spanish`, `japanese`. |
| `sourceCountry` | query | no | string | Restrict to a publishing country, e.g. `japan`, `germany`, `unitedstates`. |
| `timeline` | query | no | string | Set `false` to skip the timeline call. Faster and less likely to hit GDELT's throttle. Default `true`. |

### Example request

```bash
curl -s -H "X-PAYMENT: <base64 payload>" "http://localhost:4022/query?q=semiconductor%20export%20controls&timespan=3d&maxRecords=25"
```

### Response `200 application/json`

`volumeTimeline` comes from a second GDELT call. If that call is throttled or fails, it degrades to `null` and `timelineStatus` carries the reason — the article set you paid for is still complete. `effectiveQuery` shows exactly what was sent upstream after multi-word quoting and any `sourcelang:` / `sourcecountry:` operators were appended.

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

### Errors

| HTTP | `error` | When |
|------|---------|------|
| 400 | `missing_query` | No `q` parameter. Nothing settled. |
| 400 | `invalid_max_records` | `maxRecords` outside 1…75. Nothing settled. |
| 503 | `gdelt_throttled` | GDELT rate-limited this server after retries. Nothing settled. |
| 502 | `upstream_error` | GDELT rejected the query or timed out. Nothing settled. |
| 402 | — | No or invalid `X-PAYMENT`. Body carries `accepts` with both rails. |
| 502 | `upstream_error` | The upstream data source failed or timed out. |

---

## `GET /pulse`

**$0.002** — Only the articles indexed since your cursor, plus a fresh cursor

### Parameters

| Param | In | Required | Type | Description |
|-------|----|----------|------|-------------|
| `q` | query | yes | string | Search terms, same syntax as `/query`. |
| `cursor` | query | yes | string | Where to resume from: GDELT's `YYYYMMDDHHMMSS` or any ISO-8601 timestamp. Use the `nextCursor` from your previous pulse. |
| `maxRecords` | query | no | integer | Articles to return, 1–75. Default 50. |

### Example request

```bash
curl -s -H "X-PAYMENT: <base64 payload>" "http://localhost:4022/pulse?q=semiconductor%20export%20controls&cursor=20260806T000000Z&maxRecords=50"
```

### Response `200 application/json`

This is the pay-per-poll route: each paid call returns a real delta, not a subscription. `nextCursor` is deliberately set 60 seconds behind now, because GDELT indexes with ~15 minutes of latency — using it guarantees the next poll cannot skip an article still being ingested. `truncated: true` means you hit `maxRecords` and should poll again immediately with the same cursor rather than waiting.

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

### Errors

| HTTP | `error` | When |
|------|---------|------|
| 400 | `missing_query` | No `q` parameter. Nothing settled. |
| 400 | `missing_cursor` | No `cursor` parameter. Nothing settled. |
| 400 | `invalid_cursor` | Cursor is neither `YYYYMMDDHHMMSS` nor ISO-8601. Nothing settled. |
| 503 | `gdelt_throttled` | GDELT rate-limited this server after retries. Nothing settled. |
| 502 | `upstream_error` | GDELT failed or timed out. Nothing settled. |
| 402 | — | No or invalid `X-PAYMENT`. Body carries `accepts` with both rails. |
| 502 | `upstream_error` | The upstream data source failed or timed out. |


---

## Free routes

### `GET /`

Service metadata: description, live prices, active payment rails, data-source
status, and docs links.

### `GET /health`

```json
{ "status": "ok", "uptime": 12.5 }
```

### `GET /.well-known/x402`

The discovery manifest — every resource with its price, output schema, and both
accepted rails. See [agents.md](agents.md).
