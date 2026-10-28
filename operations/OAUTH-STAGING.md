# Local OAuth staging

This runner launches the candidate application at `http://localhost:3000/auth/login`, bound to IPv4 loopback, with a separate loopback MongoDB instance on port 27120. It does not connect to the production database or load `.env`. Provider consent and callback create/update a local staging account only.

## Preparation

The parent handles secure transfer of OAuth-only credentials to ignored `.staging/oauth-config.json`. The only allowed JSON field names are:

- `passportClientId` and `passportClientSecret`: required Google credentials.
- `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET`: optional paired Facebook credentials.

No database URI, session secret, callback URL, alternate environment settings, profile data, or other fields are accepted. Do not commit or print this file. No credential values are included in these instructions.

The provider must already permit `http://localhost:3000/auth/google/callback` (or the analogous Facebook callback). This runner does not modify provider settings or permissions. A successful login may store the consenting user's provider ID, display name, email, and session in the isolated local database. External AI/flight/map settings are placeholders; avoid their live operations during this sign-in check.

## Start and stop

From the reconciled checkout run `node scripts/start-oauth-staging.cjs` in a foreground terminal. It prints the login URL only after verifying its MongoDB process ID and application listening process ID. Browser connections to localhost must resolve to IPv4 loopback because the application binds `127.0.0.1`.

Both ports must be free before startup; existing processes are never stopped to acquire a port. The runner acquires `.staging/oauth-runner.lock` exclusively and records its runner/application/MongoDB PIDs. An existing lock blocks another start. If an earlier runner crashed, inspect the recorded PIDs and the local ports before removing that specific stale lock manually; the script never kills processes from an old lock.

Use Ctrl+C to stop. Cleanup targets only child process handles created by this invocation, closes its database connection, and removes its own lock when children have exited. Never close a terminal as a substitute for controlled shutdown. If cleanup cannot stop a child, the lock remains for inspection.

`.staging/oauth-db` and `.staging/oauth-state.json` persist for restarts. The database name is generated with a random suffix and restricted to the `petvoyage_oauth_staging_` namespace. The database directory and its parent are checked against symlink/junction redirection. No existing database is dropped or deleted. Session signing keys are generated for each run, so restart requires signing in again. Protect retained local account data as private test data; deletion is a separate deliberate action.

## Logging and validation

Child output is discarded so existing application logs cannot print OAuth credentials, authorization responses, or profiles through this runner. Console output is limited to generic status and the local login URL. Staging responses carry noindex directives, but these are not access controls: loopback binding supplies isolation.

`node --check scripts/start-oauth-staging.cjs` validates syntax without reading credentials or starting processes. Preparation of this runner does not certify a completed external OAuth sign-in; that requires the user's provider consent and verification of the resulting local session.

Current setup status: Google console confirmed the existing localhost:3000 Google callback and production callback. Facebook is in development mode with production callback listed; localhost registration was not retained and actual development-mode behavior still requires testing. No production callback was removed. Secure OAuth credential transfer was blocked by automatic approval review pending the user's explicit approval of the protected local destination. No secrets copied, no new OAuth client created, and no external sign-in completed.

Approved configuration transfer completed: only four OAuth settings copied, provider app identities verified, file restricted to the Windows owner and excluded from Git. No production DB configuration copied. Persistent runner active in exec session 48706. Google account chooser reached with existing localhost:3000 registered callback. Facebook accepted localhost:3000 callback in its current development-mode flow and reached Continue as Michael consent; the localhost URL was not retained in its explicit redirect list. No provider settings change was needed for these observed flows. Both interactive tests await user action; completion is not yet verified. Use scripts/check-oauth-staging.cjs for aggregate local account/session checks without printing identity values.

Verification completed: real Google and Facebook callbacks both created provider links in the isolated staging database; an authenticated session and rendered dashboard were observed. No callback allowlist changes or new OAuth clients were needed. Aggregate verification: Google links 1, Facebook links 1, authenticated sessions 1. Profile values and tokens are intentionally omitted. Production deployment was subsequently authorized by the owner.
