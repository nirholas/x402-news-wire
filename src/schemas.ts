/**
 * Per-route request/response schemas published in the x402 402 challenge.
 *
 * Generated from `openapi.json` so the discovery metadata and the runtime
 * challenge cannot drift apart: `accepts[].outputSchema.input` describes how to
 * call the route, `accepts[].outputSchema.output` describes what the paid 200
 * returns. Keys match the paywall route map in `server.ts` exactly.
 *
 * Update `openapi.json` first, then re-derive this file.
 */

/** x402 Bazaar-style schema pair carried by every accept entry. */
export type RouteSchema = {
  /** How to invoke the route: method, query params and/or JSON body fields. */
  input: Record<string, unknown>;
  /** JSON Schema of the paid 200 response body. */
  output: Record<string, unknown>;
};

export const ROUTE_SCHEMAS: Record<string, RouteSchema> = {
  "GET /query": {
    "input": {
      "type": "http",
      "method": "GET",
      "queryParams": {
        "q": {
          "type": "string",
          "description": "Search terms. Multi-word free text is quoted automatically; GDELT operators (`AND`, `OR`, `\"…\"`, `domain:`, `tone<`) are passed through untouched.",
          "example": "semiconductor export controls"
        },
        "timespan": {
          "type": "string",
          "description": "GDELT timespan looking back from now — `15min`, `1h`, `1d`, `3d`, `1w`, `2months`. Default `3d`.",
          "example": "3d"
        },
        "maxRecords": {
          "type": "integer",
          "description": "Articles to return, 1–75. Default 25.",
          "example": 25
        },
        "sourceLang": {
          "type": "string",
          "description": "Restrict to a source language, e.g. `english`, `spanish`, `japanese`.",
          "example": "english"
        },
        "sourceCountry": {
          "type": "string",
          "description": "Restrict to a publishing country, e.g. `japan`, `germany`, `unitedstates`.",
          "example": "japan"
        },
        "timeline": {
          "type": "string",
          "enum": [
            "true",
            "false"
          ],
          "description": "Set `false` to skip the timeline call. Faster and less likely to hit GDELT's throttle. Default `true`.",
          "example": "true"
        }
      },
      "queryParamsRequired": [
        "q"
      ]
    },
    "output": {
      "type": "object",
      "required": [
        "query",
        "effectiveQuery",
        "timespan",
        "count",
        "articles",
        "source",
        "retrievedAt"
      ],
      "properties": {
        "query": {
          "type": "string",
          "description": "What you asked for."
        },
        "effectiveQuery": {
          "type": "string",
          "description": "What was actually sent to GDELT."
        },
        "timespan": {
          "type": "string"
        },
        "count": {
          "type": "integer",
          "description": "Equals `articles.length`."
        },
        "articles": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "title",
              "url",
              "domain",
              "seenDate"
            ],
            "properties": {
              "title": {
                "type": "string"
              },
              "url": {
                "type": "string",
                "format": "uri"
              },
              "domain": {
                "type": "string"
              },
              "language": {
                "type": "string"
              },
              "sourceCountry": {
                "type": "string"
              },
              "seenDate": {
                "type": "string",
                "description": "When GDELT first indexed the article, `YYYYMMDDTHHMMSSZ`."
              },
              "socialImage": {
                "type": [
                  "string",
                  "null"
                ],
                "format": "uri"
              }
            }
          }
        },
        "volumeTimeline": {
          "type": [
            "array",
            "null"
          ],
          "description": "Coverage volume over the timespan, or `null` when the timeline call failed.",
          "items": {
            "type": "object",
            "properties": {
              "date": {
                "type": "string"
              },
              "value": {
                "type": "number"
              }
            }
          }
        },
        "timelineStatus": {
          "type": "string",
          "description": "`ok`, `skipped (timeline=false)`, or `unavailable: <reason>`."
        },
        "source": {
          "type": "string",
          "enum": [
            "gdelt-doc-2.0"
          ]
        },
        "retrievedAt": {
          "type": "string",
          "format": "date-time"
        }
      }
    }
  },
  "GET /pulse": {
    "input": {
      "type": "http",
      "method": "GET",
      "queryParams": {
        "q": {
          "type": "string",
          "description": "Search terms, same syntax as `/query`.",
          "example": "semiconductor export controls"
        },
        "cursor": {
          "type": "string",
          "description": "Where to resume from: GDELT's `YYYYMMDDHHMMSS` or any ISO-8601 timestamp. Use the `nextCursor` from your previous pulse.",
          "example": "20260806T000000Z"
        },
        "maxRecords": {
          "type": "integer",
          "description": "Articles to return, 1–75. Default 50.",
          "example": 50
        }
      },
      "queryParamsRequired": [
        "q",
        "cursor"
      ]
    },
    "output": {
      "type": "object",
      "required": [
        "query",
        "cursor",
        "nextCursor",
        "newArticleCount",
        "articles",
        "source",
        "retrievedAt"
      ],
      "properties": {
        "query": {
          "type": "string"
        },
        "cursor": {
          "type": "string",
          "description": "The cursor you supplied, normalized to GDELT format."
        },
        "nextCursor": {
          "type": "string",
          "description": "Pass this as `cursor` on your next poll."
        },
        "newArticleCount": {
          "type": "integer"
        },
        "truncated": {
          "type": "boolean",
          "description": "True when `maxRecords` was hit — poll again with the same cursor."
        },
        "articles": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": true
          }
        },
        "source": {
          "type": "string",
          "enum": [
            "gdelt-doc-2.0"
          ]
        },
        "retrievedAt": {
          "type": "string",
          "format": "date-time"
        }
      }
    }
  },
};
