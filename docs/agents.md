# For AI agents — x402-news-wire

`x402-news-wire` turns "what is being reported about this right now?" into a
single paid HTTP call. No developer account, no API key rotation, no monitoring
seat — an agent pays $0.003 for a full query or $0.002 for a delta pulse and
gets the articles back in the same response.

## 1. Discover

Two machine-readable descriptions, both free to fetch:

| Where | What it is |
|-------|-----------|
| `GET /.well-known/x402` | The x402 discovery manifest: every resource, its price, its output schema, and both accepted payment rails. |
| [`skill.md`](https://github.com/nirholas/x402-news-wire/blob/main/skill.md) | The agent-facing skill file: prose an LLM can read directly to learn the endpoints, parameters, and payment flow. |
| [`openapi.json`](https://github.com/nirholas/x402-news-wire/blob/main/openapi.json) | OpenAPI 3.1, including the 402 `PaymentRequirements` schema. |

```bash
curl -s http://localhost:4022/.well-known/x402 | jq '.resources[] | {resource, price, networks}'
```

```json
{
  "resource": "GET /query",
  "price": "$0.003",
  "networks": ["base-sepolia", "solana"]
}
```

## 2. Pay — on either rail

**Pay in USDC on Base or Solana; your client picks the rail.** An unpaid request
returns 402 with an `accepts` array containing one entry per rail:

```jsonc
{
  "x402Version": 1,
  "accepts": [
    {
      "scheme": "exact",
      "network": "base-sepolia",          // "base" on mainnet
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",   // USDC
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
      "maxAmountRequired": "3000",             // 6 decimals
      "extra": { "name": "USDC", "version": "2" }   // EIP-712 domain
    },
    {
      "scheme": "exact",
      "network": "solana",                 // "solana-devnet" on devnet
      "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",  // USDC mint
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
      "maxAmountRequired": "3000",
      "extra": { "feePayer": "<facilitator sponsor>" }  // pays the SOL fee
    }
  ]
}
```

Every accept entry also carries `outputSchema`, split into `input` — the method,
query params and/or JSON body fields the route expects — and `output`, the JSON
Schema of the paid 200 body. Both are generated from `openapi.json`, so the
challenge you get at runtime and the published spec never disagree. An agent that
hits a 402 cold has everything it needs to construct a valid call without reading
any documentation.

**Protocol version.** This service speaks **x402 v1** (`"x402Version": 1`), which
is what every `x402-fetch` client in this repo's examples expects. x402 v2 moves
the schema into `extensions.bazaar.schema` and switches to CAIP-2 network ids; it
is a planned future upgrade for agentcash compatibility, not a change you need to
handle today.

**EVM path.** Sign an EIP-3009 `transferWithAuthorization`. Entirely
client-side; no gas from the payer. `x402-fetch` does it in two lines:

```ts
import { createSigner, wrapFetchWithPayment } from "x402-fetch";
const payFetch = wrapFetchWithPayment(fetch, await createSigner("base-sepolia", KEY));
const artifact = await (await payFetch("${BASE}/query?q=semiconductor%20export%20controls&timespan=3d&maxRecords=25")).json();
```

**Solana path.** Build an SPL `transferChecked` to `payTo` for
`maxAmountRequired`, using `extra.feePayer` as the transaction fee payer, and
sign it. The buyer needs USDC only — the facilitator sponsors the SOL fee.
Base64-encode `{ x402Version: 1, scheme: "exact", network, payload: { transaction } }`
into `X-PAYMENT`.

Either way the server verifies and settles through the facilitator at
`https://x402.org/facilitator` and returns the artifact.

## 3. Read the receipt

Successful responses carry `X-PAYMENT-RESPONSE` — base64 JSON:

```json
{ "success": true, "rail": "solana", "network": "solana",
  "transaction": "<signature>", "payer": "<buyer>",
  "amount": "3000", "asset": "USDC" }
```

Log it: it is your proof of spend, on whichever chain you used.

## 4. What you get back

- `GET /query` (**$0.003**) — Matching articles (title, URL, domain, language, source country, seen date) and a coverage-volume timeline over the timespan
- `GET /pulse` (**$0.002**) — New articles since the caller's cursor, a `nextCursor` for the following poll, and a `truncated` flag

Nothing is deferred. The artifact is in the body of the 200 you paid for.

## 5. MCP integration

[`examples/mcp-tool.md`](https://github.com/nirholas/x402-news-wire/blob/main/examples/mcp-tool.md)
has a complete MCP server that exposes these routes as Claude tools, including a
spend cap so a runaway loop cannot drain the wallet.

## 6. Listing an instance

Deployed your own? Make it discoverable:

- **[x402scan.com](https://x402scan.com)** — crawls `/.well-known/x402`. Submit
  your base URL; keep the manifest at that exact path.
- **x402 Bazaar** — the facilitator's resource directory. Resources are listed
  from the `discoverable` flag in the 402 `outputSchema.input` (set by default
  here).
- **[agentic.market](https://agentic.market)** — agent-facing service catalog;
  submit the base URL plus a link to `skill.md`.

Keep `/.well-known/x402`, `skill.md`, and `openapi.json` consistent when you
change prices — indexers read all three.

## Questions

nichxbt@gmail.com · <https://github.com/nirholas/x402-news-wire>
