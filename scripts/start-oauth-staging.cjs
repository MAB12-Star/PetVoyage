/* Persistent, isolated OAuth staging. Run in the foreground; Ctrl+C stops only its children. */
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const { MongoClient } = require('mongodb');

const root = path.resolve(__dirname, '..');
const staging = path.join(root, '.staging');
const dbPath = path.join(staging, 'oauth-db');
const lockPath = path.join(staging, 'oauth-runner.lock');
const configPath = path.join(staging, 'oauth-config.json');
const statePath = path.join(staging, 'oauth-state.json');
const mongodPath = 'C:\\Program Files\\MongoDB\\Server\\7.0\\bin\\mongod.exe';
const base = 'http://localhost:3000';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const systemEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(SystemRoot|WINDIR|PATH|PATHEXT|TEMP|TMP|COMSPEC|APPDATA|LOCALAPPDATA|USERPROFILE|HOMEDRIVE|HOMEPATH)$/i.test(key)));
const children = [];
let mongo, app, client, lock, stopping = false, cleaning;

function fail(message) { throw new Error(message); }

async function portFree(port, host) {
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen({ port, host, exclusive: true }, () => probe.close(resolve));
  }).catch(() => fail(`Required local port ${port} is unavailable; no existing process was stopped.`));
}

async function listenerPid(port) {
  // Check the OS owner before sending HTTP to any process on the reserved port.
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const { stdout } = await promisify(execFile)(powershell, ['-NoProfile', '-NonInteractive', '-Command',
    `(Get-NetTCPConnection -State Listen -LocalAddress 127.0.0.1 -LocalPort ${port} -ErrorAction Stop).OwningProcess | Select-Object -Unique`],
  { windowsHide: true, env: systemEnv, timeout: 5000 });
  const ids = stdout.trim().split(/\s+/).map(Number);
  return ids.length === 1 ? ids[0] : null;
}

function launch(command, args, env) {
  const child = spawn(command, args, { cwd: root, env, windowsHide: true, stdio: 'ignore' });
  children.push(child);
  child.on('error', () => { child.failed = true; });
  child.on('exit', () => {
    if (!stopping) {
      console.error('A staging process stopped; shutting down the isolated session.');
      process.exitCode = 1;
      cleanup();
    }
  });
  return child;
}

function alive(child) { return child && !child.failed && child.exitCode === null && child.signalCode === null; }

async function stop(child) {
  if (!alive(child)) return;
  const exited = once(child, 'exit').catch(() => {});
  child.kill();
  await Promise.race([exited, delay(5000)]);
  if (alive(child)) fail('A staging child did not stop. Keep the runner lock and inspect its recorded PID.');
}

function cleanup() {
  if (cleaning) return cleaning;
  stopping = true;
  cleaning = (async () => {
    let stopped = true;
    try { await stop(app); } catch { stopped = false; }
    if (client) await client.close().catch(() => {});
    try { await stop(mongo); } catch { stopped = false; }
    if (lock) {
      await lock.close();
      if (stopped) await fs.unlink(lockPath).catch(() => {});
    }
    console.log(stopped ? 'OAuth staging stopped; isolated database retained.' : 'Staging cleanup needs attention; PID lock retained.');
    if (!stopped) process.exitCode = 1;
  })();
  return cleaning;
}

async function main() {
  if (process.platform !== 'win32') fail('This runner requires the configured Windows MongoDB installation.');
  if (await fs.stat(path.join(root, '.env')).then(() => true, () => false)) fail('Candidate .env must be absent.');
  const config = JSON.parse((await fs.readFile(configPath, 'utf8')).replace(/^\uFEFF/, ''));
  const allowed = new Set(['passportClientId', 'passportClientSecret', 'FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET']);
  if (!config || Array.isArray(config) || typeof config !== 'object' || Object.keys(config).some(key => !allowed.has(key))) {
    fail('OAuth configuration must contain only the documented provider credential fields.');
  }
  if (Object.values(config).some(value => typeof value !== 'string' || !value.trim())) fail('OAuth fields must be nonempty strings.');
  if (!config.passportClientId || !config.passportClientSecret) fail('Google provider credentials are required.');
  if (Boolean(config.FACEBOOK_APP_ID) !== Boolean(config.FACEBOOK_APP_SECRET)) fail('Facebook fields must be supplied together.');
  await fs.access(mongodPath);
  await fs.mkdir(staging, { recursive: true });
  // Reject junctions/symlinks: retained test data must remain under this checkout.
  if (await fs.realpath(staging) !== staging) fail('Staging directory must not be redirected.');
  try { lock = await fs.open(lockPath, 'wx'); }
  catch { fail('OAuth runner lock already exists. Inspect its PIDs; this runner never kills a prior process.'); }
  await lock.writeFile(JSON.stringify({ runnerPid: process.pid, appPort: 3000, mongoPort: 27120 }));
  for (const port of [3000, 27120]) {
    await portFree(port, '127.0.0.1');
    await portFree(port, '::1');
  }
  await fs.mkdir(dbPath, { recursive: true });
  if (await fs.realpath(dbPath) !== dbPath || path.dirname(dbPath) !== staging) fail('OAuth database path must remain isolated.');
  let state;
  try { state = JSON.parse(await fs.readFile(statePath, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') fail('OAuth state file is invalid.');
    state = { databaseName: `petvoyage_oauth_staging_${randomBytes(10).toString('hex')}` };
    await fs.writeFile(statePath, JSON.stringify(state), { flag: 'wx' });
  }
  if (!/^petvoyage_oauth_staging_[a-f0-9]{20}$/.test(state.databaseName)) fail('Refusing an unexpected database name.');
  const uri = `mongodb://127.0.0.1:27120/${state.databaseName}`;
  mongo = launch(mongodPath, ['--dbpath', dbPath, '--port', '27120', '--bind_ip', '127.0.0.1', '--quiet'], systemEnv);
  client = new MongoClient(uri, { serverSelectionTimeoutMS: 500, connectTimeoutMS: 500 });
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (!alive(mongo)) fail('Isolated MongoDB did not start.');
    try {
      await client.connect();
      const status = await client.db('admin').command({ serverStatus: 1 });
      if (Number(status.pid) !== mongo.pid) fail('MongoDB process ownership check failed.');
      ready = true;
      break;
    } catch { await delay(250); }
  }
  if (!ready) fail('Isolated MongoDB did not become ready.');
  const env = {
    ...systemEnv, NODE_ENV: 'staging', HOST: '127.0.0.1', PORT: '3000',
    BASE_URL: base, PUBLIC_BASE_URL: base, mongoKey: uri, MONGODB_URI: uri,
    SESSION_SECRET: randomBytes(48).toString('hex'),
    openaiKey: 'staging-placeholder-not-a-key', OPENAI_API_KEY: 'staging-placeholder-not-a-key',
    AMADEUS_CLIENT_ID: 'staging-placeholder', AMADEUS_CLIENT_SECRET: 'staging-placeholder',
    GOOGLE_MAPS_API_KEY: 'staging-placeholder',
    FACEBOOK_APP_ID: 'staging-placeholder', FACEBOOK_APP_SECRET: 'staging-placeholder',
    ...config,
    GOOGLE_CALLBACK_URL: `${base}/auth/google/callback`,
    FACEBOOK_CALLBACK_URL: `${base}/auth/facebook/callback`
  };
  app = launch(process.execPath, ['app.js'], env);
  await lock.truncate(0);
  await lock.write(JSON.stringify({ runnerPid: process.pid, appPid: app.pid, mongoPid: mongo.pid, appPort: 3000, mongoPort: 27120 }), 0, 'utf8');
  ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (!alive(app) || !alive(mongo) || stopping) fail('OAuth staging could not start.');
    try {
      if (await listenerPid(3000) !== app.pid) { await delay(250); continue; }
      const response = await fetch('http://127.0.0.1:3000/auth/login', {
        redirect: 'manual', signal: AbortSignal.timeout(2000)
      });
      await response.arrayBuffer();
      if (response.status === 200 && response.headers.get('x-robots-tag')?.includes('noindex')) { ready = true; break; }
    } catch { await delay(250); }
  }
  if (!ready) fail('OAuth staging did not become ready.');
  console.log(`OAuth staging ready: ${base}/auth/login`);
  console.log('Only the isolated local database is used. Stop with Ctrl+C.');
  // Child process handles keep this runner alive until stopped.
}

for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { cleanup().finally(() => process.exit(process.exitCode || 0)); });
main().catch(() => {
  console.error('OAuth staging startup failed. Check documented configuration, local ports, and runner lock.');
  process.exitCode = 1;
  cleanup();
});
