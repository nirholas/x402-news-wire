# Raw HTTP walkthrough — 402 → pay → 200

Everything below is plain `curl`. No SDK required.

## 0. Start the server

```bash
npm install
npm run dev      # http://localhost:4022
```

## 1. Free routes need no payment

```bash
curl -s http://localhost:4022/health
curl -s http://localhost:4022/ | jq
curl -s http://localhost:4022/.well-known/x402 | jq
```

## 2. Call a paid route with no payment → 402, both rails

```bash
curl -s -i "http://localhost:4022/query?q=semiconductor%20export%20controls&timespan=3d&maxRecords=25"
```

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json
```

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "hint": "Pay in USDC on Base or Solana — your client picks the rail. See /.well-known/x402",
  "accepts": [
    {
      "scheme": "exact",
      "network": "base-sepolia",
      "maxAmountRequired": "3000",
      "resource": "http://localhost:4022/query",
      "description": "Search worldwide news coverage and get the matching articles plus a volume timeline",
      "mimeType": "application/json",
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
      "maxTimeoutSeconds": 120,
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "extra": { "name": "USDC", "version": "2" }
    },
    {
      "scheme": "exact",
      "network": "solana",
      "maxAmountRequired": "3000",
      "resource": "http://localhost:4022/query",
      "description": "Search worldwide news coverage and get the matching articles plus a volume timeline",
      "mimeType": "application/json",
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
      "maxTimeoutSeconds": 120,
      "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "extra": { "name": "USDC", "decimals": 6, "feePayer": "<facilitator sponsor>" }
    }
  ]
}
```

`maxAmountRequired` is in USDC base units (6 decimals): `3000` = $0.003.

## 3. Build the payment

Pick **one** entry from `accepts`.

**EVM (Base):** sign an EIP-3009 `transferWithAuthorization` for
`maxAmountRequired` USDC to `payTo`. No gas needed from you — the facilitator
submits it.

**Solana:** build an SPL `transferChecked` of `maxAmountRequired` USDC to
`payTo`, with `extra.feePayer` as the transaction fee payer, and sign it. You
need USDC only — the facilitator sponsors the SOL fee.

Either way, base64-encode the x402 payload:

```json
{ "x402Version": 1, "scheme": "exact", "network": "<the rail you picked>", "payload": { … } }
```

In practice, let a library do it:

```bash
PRIVATE_KEY=0xYourTestKey npm run client
```

## 4. Repeat the request with the header → 200 + artifact

```bash
curl -s -i -H "X-PAYMENT: <base64 payload>" "http://localhost:4022/query?q=semiconductor%20export%20controls&timespan=3d&maxRecords=25"
```

```http
HTTP/1.1 200 OK
Content-Type: application/json
X-PAYMENT-RESPONSE: eyJzdWNjZXNzIjp0cnVlLCJyYWlsIjoiZXZtIiwi…
```

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

Decode the receipt:

```bash
echo '<X-PAYMENT-RESPONSE value>' | base64 -d | jq
# { "success": true, "rail": "evm", "network": "base-sepolia",
#   "transaction": "0x…", "payer": "0x…", "amount": "3000", "asset": "USDC" }
```

The artifact is in the body of that same 200. There is nothing else to fetch.

## All paid routes

### `GET /query` — $0.003

```bash
curl -s -H "X-PAYMENT: <payload>" "http://localhost:4022/query?q=semiconductor%20export%20controls&timespan=3d&maxRecords=25"
```

### `GET /pulse` — $0.002

```bash
curl -s -H "X-PAYMENT: <payload>" "http://localhost:4022/pulse?q=semiconductor%20export%20controls&cursor=20260806T000000Z&maxRecords=50"
```
