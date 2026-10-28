// Read-only verification: report aggregate sign-in state, never identifiers or tokens.
const fs = require('node:fs/promises');
const path = require('node:path');
const { MongoClient } = require('mongodb');
(async () => {
  const root = path.resolve(__dirname, '..');
  const state = JSON.parse(await fs.readFile(path.join(root, '.staging', 'oauth-state.json'), 'utf8'));
  if (!/^petvoyage_oauth_staging_[a-f0-9]{20}$/.test(state.databaseName)) throw Error('Unexpected staging database');
  const lock = JSON.parse(await fs.readFile(path.join(root, '.staging', 'oauth-runner.lock'), 'utf8'));
  const client = new MongoClient(`mongodb://127.0.0.1:27120/${state.databaseName}`, { serverSelectionTimeoutMS: 3000 });
  try {
    await client.connect();
    const server = await client.db('admin').command({ serverStatus: 1 });
    if (Number(server.pid) !== lock.mongoPid) throw Error('Staging database process mismatch');
    const db = client.db();
    const users = db.collection('users');
    const googleAccounts = await users.countDocuments({ googleId: { $type: 'string' } });
    const facebookAccounts = await users.countDocuments({ facebookId: { $type: 'string' } });
    const activeSessions = await db.collection('sessions').countDocuments({ expires: { $gt: new Date() } });
    const sessions = await db.collection('sessions').find({ expires: { $gt: new Date() } }, { projection: { session: 1 } }).toArray();
    let authenticatedSessions = 0;
    for (const record of sessions) {
      try {
        const session = typeof record.session === 'string' ? JSON.parse(record.session) : record.session;
        if (session?.passport?.user) authenticatedSessions++;
      } catch { /* An unreadable session is not evidence of a completed login. */ }
    }
    console.log(JSON.stringify({ stagingDatabaseReachable: true, googleAccounts, facebookAccounts, activeSessions, authenticatedSessions }));
  } finally { await client.close(); }
})().catch(() => { console.error('Staging verification failed; check runner readiness.'); process.exitCode = 1; });
