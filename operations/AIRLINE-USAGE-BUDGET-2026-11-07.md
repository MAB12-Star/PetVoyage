# Airline research budget correction — November 7, 2026

The owner approved a $5 total airline-research pilot, not a five-request limit. The old implementation counted five $1 reservations as exhausted even after the requests completed at much lower usage. This release replaces the request-count stop with persistent integer-microUSD usage accounting; the $5 limit is unchanged. All historical usage is imported; legacy reservations and attempts remain auditable.

Requests reserve $1 before any paid call. Measured pinned-model token and web-tool usage settles at current published standard prices plus20percent and$0.001 safety padding; unknown/failed charges retain the full hold. Atomic spent+held checks block requests without reserve room; duplicate settlements cannot release money twice; anomalous oversized charges pause future requests. Standard service tier is explicit. These are conservative application-budget estimates, not an invoice or an account-wide OpenAI billing cap.

Official rate sources checked November7: https://developers.openai.com/api/docs/models/gpt-5.4-mini and https://developers.openai.com/api/docs/pricing . Model rates$0.75 input/$4.50 output per1Mtokens; web search$0.01percall plusmodelinput. Cache reuses are free of new paid research calls. A new explicit form submission can retry a prior budget429; refresh retains nonce replay protection.

Independent QA passed migration of all5historicalrequests, unknown/missing usage holds, unchanged$5limit, idempotence, numeric guards, cap concurrency and submission nonce behavior. Root independently passed the same concurrency and settlement invariants using real MongoDB in a separate synthetic TTL collection. No paid OpenAI tests or customer-record changes were used for this release. Initial conservative accounted usage$0.13347, no pending holds, remaining$4.86653.

Known limits unchanged: route research is not live fare or pet-space inventory; only sourced matching routes are shown; flights cannot yet be purchased on the site.
