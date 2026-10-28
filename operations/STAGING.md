# Local staging and verification

Prepared October 27, 2026 in America/Los_Angeles. This is local, isolated staging; it is not an AWS-hosted staging deployment. Production remains unchanged.

## Run
From this checkout run `npm run test:staging`. The runner starts the actual application on 127.0.0.1:3101 and a dedicated installed MongoDB 7.0 process on 127.0.0.1:27119. It verifies that the database daemon belongs to the runner before writing anything. A uniquely named database and directory under ignored `.staging/` hold only synthetic fixtures. Ports must be free. Windows MongoDB is expected at `C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe`.

The runner supplies generated session/account values and dummy third-party credentials through a restricted environment. Staging skips dotenv and the runner refuses a checkout containing `.env`. It follows no OAuth provider redirects and calls no paid APIs. Its own app/database processes stop after the test and its own temporary database directory is removed. It does not change the installed MongoDB service or production records. No persistent preview service remains running.

## Passed against the combined candidate
- Real MongoDB ping, insert, read and update of synthetic fixtures.
- Actual application startup and Mongo-backed session initialization.
- Thirteen public pages: home, login, register, about, contact, FAQ, terms, privacy, flight search, airline directory, country directory, blog and tips. These use the isolated database, initially empty of production content.
- Flight GET returns complete HTML; the existing lightweight HEAD probe returns 200 with no body.
- Anonymous dashboard protection and working login destination; legacy /login link compatibility.
- Synthetic registration, hashed password verification, dashboard/profile rendering, and persisted MongoDB session.
- Session survives a full application restart; logout revokes access; wrong passwords are rejected; correct passwords restore access.
- Google/Facebook initiation redirects use local staging callbacks; provider pages were not requested.
- Staging noindex headers and robots exclusion.
- Invalid database configuration exits nonzero without opening the HTTP listener or exposing its configuration.
- Earlier navigation/content regressions, 59 EJS template compilations and native bcrypt/sharp load checks passed.

Separately, a read-only check on AWS confirmed the existing production database is reachable and collection metadata is readable. The live Google/Facebook entry points returned 302 to the expected providers with HTTPS production callbacks. No customer records were retrieved or test users created in production.

## Bugs found and fixed
The dashboard redirected visitors to nonexistent /login; it now uses /auth/login and the legacy /login alias supports existing task/favorite links. The flight GET renderer was wrapped in an async helper despite not returning a promise; the resulting error handler raced the original render and truncated responses. Removed that wrapper while preserving AWS HEAD support.

Startup now accepts HOST/PORT and waits for application/session database readiness before serving. Staging has a bounded five-second database selection timeout; production driver defaults are retained. Connection details no longer appear in startup error output.

## Remaining deployment gates
This does not certify every feature or Linux/AWS runtime behavior. Actual Google/Facebook consent, token exchange and callback completion require provider-registered staging callback URLs, appropriate test-client credentials and an interactive account. Dummy local client IDs cannot prove those provider settings. AI summaries, paid flight services, Shopify checkout and production content-specific paths were not exercised by this suite. No production database clone or data migration was performed.

Before live release, configure an approved staging provider client/callback or complete an owner-assisted provider check, then perform the agreed deployment review and smoke checks. No production publishing is authorized by this test run.
