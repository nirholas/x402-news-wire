# Tutorial — x402-news-wire

From a clean checkout to a paid API call, on either payment rail.

## 1. Install

```bash
git clone https://github.com/nirholas/x402-news-wire
cd x402-news-wire
npm install
```

Node 18 or newer.

## 2. Configure (optional)

```bash
cp .env.example .env
```

Nothing is required. Out of the box the server:

- listens on port `4022`,
- accepts USDC on **Base Sepolia** and on **Solana**, paying out to the suite's
  public receive addresses,
- queries GDELT's DOC 2.0 API live — no key needed, nothing to configure.

To be paid yourself, change these two lines:

```bash
PAY_TO_ADDRESS=0xYourEvmAddress
SOLANA_PAY_TO_ADDRESS=YourSolanaAddress
```

Nothing here requires a key. GDELT is free and open.

The one thing worth tuning is the throttle gap. GDELT allows about one request
every five seconds per IP, and `/query` makes two calls (articles + timeline).
If you run from a shared or busy egress address you may see
`503 gdelt_throttled`; raise the gap:

```bash
GDELT_MIN_GAP_MS=8000
```

A throttled call is never charged — settlement only happens on a 2xx.

## 3. Run the server

```bash
npm run dev
```

```
x402-news-wire v0.1.0 listening on :4022
  payment rails:
    EVM     base-sepolia  USDC → 0x40252CFDF8B20Ed757D61ff157719F33Ec332402
    Solana  solana         USDC → WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW
  facilitator: https://x402.org/facilitator
  paid routes:
    GET /query                   $0.003
    GET /pulse                   $0.002
  free routes: GET /, GET /health, GET /.well-known/x402
```

Check it is alive:

```bash
curl -s http://localhost:4022/health
# {"status":"ok","uptime":1.2}
```

## 4. Your first 402

```bash
curl -s "http://localhost:4022/query?q=semiconductor%20export%20controls&timespan=3d&maxRecords=25" | jq
```

You get HTTP **402** and a challenge listing **both** rails:

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [
    { "scheme": "exact", "network": "base-sepolia", "maxAmountRequired": "3000",
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402", "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e" },
    { "scheme": "exact", "network": "solana", "maxAmountRequired": "3000",
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW", "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" }
  ]
}
```

That is the whole price negotiation: no key, no signup, no account. The price
is `3000` USDC base units (6 decimals) = **$0.003**.

## 5. Pay for real

Get a Base Sepolia test wallet and fund it with test USDC from
<https://faucet.circle.com>. Then:

```bash
PRIVATE_KEY=0xYourTestKey npm run client
```

[`examples/agent-client.ts`](../examples/agent-client.ts) does the full flow:

1. Calls the route unpaid and prints both rails from the 402.
2. Signs an EIP-3009 USDC authorization for exactly $0.003.
3. Retries with the `X-PAYMENT` header.
4. Prints the artifact and decodes the `X-PAYMENT-RESPONSE` receipt.

Prefer Solana? The bottom of that file shows the equivalent flow — the server
needs no changes, since the same 402 already advertises the `solana` rail.

## 6. Read the artifact

The 200 body **is** the purchase:

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

`articles` is the artifact: each entry has the headline, the canonical URL, the
publishing domain, the language, the source country, and `seenDate` — when GDELT
first indexed it, not when it was written. `volumeTimeline` shows coverage
volume over the timespan so you can tell a spike from steady background noise;
if it is `null`, `timelineStatus` says why and the article set is still complete.

For a watch loop, keep the `nextCursor` from `/pulse` and pass it as `cursor`
next time. Each pulse costs $0.002 and returns only what is new — pay per look,
get an answer per look.

Full field-by-field reference: [api.md](api.md).

## 7. Going to mainnet

```bash
# EVM: Base mainnet
NETWORK=base
PAY_TO_ADDRESS=0xYourRealAddress

# Solana: mainnet (this is already the default)
SOLANA_NETWORK=mainnet-beta
SOLANA_PAY_TO_ADDRESS=YourRealSolanaAddress
SOLANA_RPC_URL=https://your-dedicated-rpc.example.com

# A facilitator that settles on the networks you accept
FACILITATOR_URL=https://x402.org/facilitator
```

Then run `npm run build && npm start`. Nothing else changes: the same routes,
the same prices, real USDC.

> Use a dedicated Solana RPC in production. The public endpoint is heavily
> rate-limited.

## Where to go next

- [api.md](api.md) — every endpoint, parameter, and error
- [agents.md](agents.md) — discovery, MCP, and listing your instance
- [../skill.md](https://github.com/nirholas/x402-news-wire/blob/main/skill.md) — the agent-facing skill file
- [../examples/curl.md](https://github.com/nirholas/x402-news-wire/blob/main/examples/curl.md) — the same flow in raw curl
