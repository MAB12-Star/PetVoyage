/* Real HTTP + real MongoDB checks. Never connects to a supplied database. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const net = require('node:net');
const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');

const root = path.resolve(__dirname, '..');
const base = 'http://127.0.0.1:3101';
const mongoPort = 27119;
const mongodPath = 'C:\\Program Files\\MongoDB\\Server\\7.0\\bin\\mongod.exe';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const systemEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(SystemRoot|WINDIR|PATH|PATHEXT|TEMP|TMP|COMSPEC|APPDATA|LOCALAPPDATA|USERPROFILE|HOMEDRIVE|HOMEPATH)$/i.test(key)));
let dbDir, mongo, app, client, cookie = '';
const logs = { app: '', mongo: '' };
const sessionSecret = randomBytes(32).toString('hex');
const email = `staging-${randomBytes(6).toString('hex')}@example.invalid`;
const password = randomBytes(18).toString('hex');
const children = new Set();

function launch(command, args, env, logName = 'app') {
  const child = spawn(command, args, { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child);
  child.on('error', error => { child.startupError = error; logs[logName] = (logs[logName] + error.message).slice(-5000); });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
    logs[logName] = (logs[logName] + chunk.toString()).slice(-5000);
  });
  return child;
}

async function stop(child) {
  if (!child) return;
  if (child.exitCode === null && child.signalCode === null) {
    child.kill();
    await Promise.race([once(child, 'exit').catch(() => {}), delay(5000)]);
  }
  children.delete(child);
}

async function request(route, { method = 'GET', form, authenticated = true } = {}) {
  const url = new URL(route, base);
  assert.equal(url.origin, base, 'Requests must stay on the isolated staging server');
  const headers = { Connection: 'close' };
  if (authenticated && cookie) headers.Cookie = cookie;
  if (form) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  const response = await fetch(url, { method, headers, body: form && new URLSearchParams(form), redirect: 'manual', signal: AbortSignal.timeout(15000) });
  const setCookie = response.headers.getSetCookie();
  if (authenticated && setCookie.length) cookie = setCookie.map(value => value.split(';')[0]).join('; ');
  let text;
  try { text = await response.text(); } catch (error) { throw new Error(`Response failed for ${route}: ${error.message} (${error.cause?.code || 'no code'})`); }
  return { status: response.status, location: response.headers.get('location'), robots: response.headers.get('x-robots-tag'), contentLength: response.headers.get('content-length'), contentType: response.headers.get('content-type'), text };
}

function appEnvironment(uri) {
  return {
    ...systemEnv, NODE_ENV: 'staging', PORT: '3101', HOST: '127.0.0.1',
    BASE_URL: base, PUBLIC_BASE_URL: base, mongoKey: uri, MONGODB_URI: uri,
    SESSION_SECRET: sessionSecret,
    OPENAI_API_KEY: 'staging-placeholder-not-a-key', openaiKey: 'staging-placeholder-not-a-key',
    AMADEUS_CLIENT_ID: 'staging-placeholder', AMADEUS_CLIENT_SECRET: 'staging-placeholder',
    passportClientId: 'staging-google-client', passportClientSecret: 'staging-placeholder',
    GOOGLE_CALLBACK_URL: `${base}/auth/google/callback`,
    FACEBOOK_APP_ID: 'staging-facebook-client', FACEBOOK_APP_SECRET: 'staging-placeholder',
    FACEBOOK_CALLBACK_URL: `${base}/auth/facebook/callback`,
    GOOGLE_MAPS_API_KEY: 'staging-placeholder',
  };
}

async function startApp(uri) {
  app = launch(process.execPath, ['--require', path.join(root,'scripts/staging-ai-mock.cjs'), 'app.js'], appEnvironment(uri));
  for (let attempt = 0; attempt < 300; attempt++) {
    if (app.startupError) throw app.startupError;
    if (app.exitCode !== null) throw new Error('Staging app exited before readiness');
    try {
      const response = await request('/auth/register', { authenticated: false });
      if (response.status === 200) return;
    } catch {}
    await delay(200);
  }
  throw new Error('Staging app did not become ready on loopback port 3101');
}

function listenerOpen() {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port: 3101 });
    const finish = value => { socket.destroy(); resolve(value); };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(250, () => finish(false));
  });
}

async function invalidDatabaseStartup() {
  await stop(app);
  assert.equal(await listenerOpen(), false, 'Prior app must release staging port');
  const invalidUri = 'invalid-staging-scheme://not-a-network-destination';
  logs.app = '';
  app = launch(process.execPath, ['app.js'], appEnvironment(invalidUri));
  const deadline = Date.now() + 15000;
  while (app.exitCode === null && app.signalCode === null && Date.now() < deadline) {
    if (app.startupError) throw app.startupError;
    assert.equal(await listenerOpen(), false, 'App must never listen without a ready database');
    await delay(50);
  }
  assert.notEqual(app.exitCode, null, 'Invalid database startup must exit within 15 seconds');
  assert.notEqual(app.exitCode, 0, 'Invalid database startup must fail');
  assert.equal(await listenerOpen(), false);
  assert.ok(!logs.app.includes(sessionSecret), 'Startup logs must not expose the session secret');
  assert.ok(!logs.app.includes(invalidUri), 'Startup logs must not expose the database URL');
  console.log('PASS invalid database startup exits nonzero without opening the listener or exposing configuration');
}

async function protectedDashboard(authenticated) {
  const response = await request('/dashboard', { authenticated });
  if (authenticated) {
    assert.equal(response.status, 200, 'Authenticated dashboard should render');
    assert.match(response.text, /Welcome to Your Dashboard/);
    assert.ok(response.text.includes(email));
  } else {
    assert.equal(response.status, 302);
    assert.match(response.location, /^\/(auth\/)?login$/);
    const login = await request(response.location, { authenticated: false });
    assert.equal(login.status, 200, 'Protected dashboard must redirect to a working login page');
  }
}

async function main() {
  assert.equal(await fs.stat(path.join(root, '.env')).then(() => true, () => false), false,
    'Refusing to run: candidate .env must be absent');
  await fs.access(mongodPath);
  const stagingRoot = path.join(root, '.staging');
  await fs.mkdir(stagingRoot, { recursive: true });
  dbDir = await fs.mkdtemp(path.join(stagingRoot, 'auth-test-'));
  assert.equal(path.dirname(path.resolve(dbDir)), stagingRoot);
  mongo = launch(mongodPath, ['--dbpath', dbDir, '--port', String(mongoPort), '--bind_ip', '127.0.0.1', '--quiet'], systemEnv, 'mongo');
  console.log('Starting isolated MongoDB on loopback port 27119');
  const databaseName = `petvoyage_staging_${randomBytes(8).toString('hex')}`;
  const uri = `mongodb://127.0.0.1:${mongoPort}/${databaseName}`;
  client = new MongoClient(uri, { serverSelectionTimeoutMS: 500, connectTimeoutMS: 500, socketTimeoutMS: 3000 });
  let connected = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    if (mongo.startupError) throw mongo.startupError;
    if (mongo.exitCode !== null) throw new Error('Isolated MongoDB exited; refusing to attach to another daemon');
    try {
      await Promise.race([client.connect(), delay(2000).then(() => { throw new Error('MongoDB connection attempt timed out'); })]);
      connected = true;
      break;
    } catch { await delay(200); }
  }
  assert.ok(connected, 'Isolated MongoDB must become ready');
  // Ensure the daemon answering is ours, not a process already using the port.
  const status = await client.db('admin').command({ serverStatus: 1 });
  assert.equal(Number(status.pid), mongo.pid, 'Refusing to use a MongoDB process not spawned by this runner');
  const database = client.db(databaseName);
  assert.equal((await database.command({ ping: 1 })).ok, 1);
  const fixtures = database.collection('staging_fixtures');
  const marker = { _id: randomBytes(8).toString('hex'), value: 'created' };
  await fixtures.insertOne(marker);
  assert.equal((await fixtures.findOne({ _id: marker._id })).value, 'created');
  await fixtures.updateOne({ _id: marker._id }, { $set: { value: 'updated' } });
  assert.equal((await fixtures.findOne({ _id: marker._id })).value, 'updated');
  console.log('PASS isolated real MongoDB ping/read/write');

  await database.collection('country_regulations_list').insertMany([
    {destinationCountry:'United States',regulationsByPetType:{dog:{microchip:'SYNTHETIC_US_RECORD'}}},
    {destinationCountry:'Australia',regulationsByPetType:{'Dog & Cat':{microchip:'SYNTHETIC_AU_RECORD'}}},
    {destinationCountry:'Test Origin', regulationsByPetType:{Dog:{microchip:'SYNTHETIC_ORIGIN_REQUIREMENT'}}},
    {destinationCountry:'Test Destination', regulationsByPetType:{'Dog & Cat':{microchip:'SYNTHETIC_SELECTED_REQUIREMENT'},Ferrets:{microchip:'SYNTHETIC_UNSELECTED_REQUIREMENT'}}}
  ]);
  await database.collection('stories').insertOne({title:'A synthetic staging journey',slug:'synthetic-staging-journey',summary:'Synthetic fixture for layout and association testing.',body:'<p>Synthetic body and media are preserved.</p>',country:'Test Destination',airline:'Synthetic Air',airlineSlug:'synthetic-air',authorName:'Staging fixture',createdAt:new Date(),photos:[],comments:[]});
  await database.collection('airlines').insertOne({name:'Synthetic Air',slug:'synthetic-air',reviews:[],ImprovedPetPolicySummary:'<p>Synthetic test policy only.</p>'});
  await startApp(uri);
  for (const route of ['/', '/auth/login', '/auth/register', '/aboutUs', '/contactUs', '/faq', '/terms', '/privacy', '/flights/searchFlights', '/regulations/airlineList', '/getCountryRegulationList', '/blog', '/tips', '/plan', '/my-trips', '/guides', '/findAVet']) {
    const page = await request(route, { authenticated: false });
    assert.equal(page.status, 200, `Public page must render: ${route}`);
  }
  const discovery=await request('/flights/searchFlights?origin=United%20States&destination=Australia&petType=dog&departureAirport=LAX',{authenticated:false});assert.equal(discovery.status,200);assert.match(discovery.text,/Qantas Freight/);assert.ok(!discovery.text.includes('maps.googleapis.com'));
  assert.equal((await request('/flights/searchFlights?legacy=1',{authenticated:false})).status,200);
  const noAir=await request('/plan?origin=United%20States&destination=Australia&pet=dog',{authenticated:false});assert.match(noAir.text,/Reviewed research/);assert.match(noAir.text,/Qantas Freight/);
  const mockJourney=await request('/ai/journey',{method:'POST',form:{origin:'United States',destination:'Australia',pet:'dog'}});assert.equal(mockJourney.status,200);const mockData=JSON.parse(mockJourney.text);assert.equal(mockData.transportDiscovery.state,'reviewed-enquiry');assert.ok(mockData.result.destination.some(text=>text.includes('SYNTHETIC LOCAL PREVIEW')));
  console.log('PASS default zero-API discovery, explicit legacy entry and real planner HTTP with synthetic AI preload');
  const oldLogin = await request('/login', { authenticated: false });
  assert.equal(oldLogin.location, '/auth/login');
  assert.match((await request('/',{authenticated:false})).text,/A synthetic staging journey/);
  const countryPage=await request('/country/Test%20Destination?petType=dog-cat',{authenticated:false});
  assert.equal(countryPage.status,200); assert.match(countryPage.text,/SYNTHETIC_SELECTED_REQUIREMENT/);assert.ok(!countryPage.text.includes('SYNTHETIC_UNSELECTED_REQUIREMENT'));assert.match(countryPage.text,/A synthetic staging journey/);
  assert.equal((await request('/airlines/synthetic-air',{authenticated:false})).status,200);
  for(const route of ['/admin','/admin/agent','/admin/airline-agent']) assert.equal((await request(route,{authenticated:false})).status,302);
  assert.equal((await request('/my-trips',{method:'POST',authenticated:false,form:{}})).status,302);
  console.log('PASS public pages, real story associations, species isolation, guest workspace and admin protection');
  const flightGet = await request('/flights/searchFlights', { authenticated: false });
  const flightHead = await request('/flights/searchFlights', { method: 'HEAD', authenticated: false });
  assert.equal(flightGet.status, 200);
  assert.equal(flightHead.status, flightGet.status);
  assert.match(flightGet.contentType, /text\/html/);
  assert.equal(flightHead.text, '');
  assert.equal(Number(flightGet.contentLength), Buffer.byteLength(flightGet.text), 'GET flight response length must match actual body');
  // The existing AWS HEAD handler is a lightweight 200 status probe, not a template render.
  console.log('PASS flight GET complete HTML response and preserved lightweight HEAD probe');
  const stagingPage = await request('/auth/register', { authenticated: false });
  assert.match(stagingPage.robots || '', /noindex/);
  const robots = await request('/robots.txt', { authenticated: false });
  assert.equal(robots.status, 200);
  assert.match(robots.text, /Disallow:\s*\//);
  console.log('PASS staging noindex header and robots exclusion');
  await protectedDashboard(false);
  console.log('PASS anonymous dashboard protection and login destination');
  const registered = await request('/auth/register', { method: 'POST', form: { displayName: 'Synthetic Staging User', email, password, confirmPassword: password } });
  assert.equal(registered.status, 302);
  assert.equal(registered.location, '/dashboard');
  const user = await database.collection('users').findOne({ email });
  assert.ok(user);
  assert.notEqual(user.passwordHash, password);
  assert.ok(await bcrypt.compare(password, user.passwordHash));
  await protectedDashboard(true);
  const profile = await request('/account/profile');
  assert.equal(profile.status, 200, 'Authenticated profile should render');
  assert.match(profile.text, /Profile Settings/);
  assert.ok(profile.text.includes(email));
  assert.ok(profile.text.includes('Synthetic Staging User'));
  assert.ok(await database.collection('sessions').findOne({ 'session': { $regex: String(user._id) } }), 'Session must persist in MongoDB');
  const savedForm={origin:'Test Origin',destination:'Test Destination',petType:'dog',departureDate:'2027-01-10'};
  const research=await request('/plan?origin=Test%20Origin&destination=Test%20Destination&pet=dog');
  assert.equal(research.status,200);assert.match(research.text,/petType=dog-cat/);
  assert.equal((await request('/my-trips',{method:'POST',form:savedForm})).status,302);
  assert.equal((await request('/my-trips',{method:'POST',form:savedForm})).status,302);
  assert.equal((await request('/my-trips',{method:'POST',form:{...savedForm,destination:'<script>invalid</script>'}})).status,400);
  const savedUser=await database.collection('users').findOne({_id:user._id});assert.equal(savedUser.researchPlans.length,1);
  // Exercise server-owned generated results with synthetic session data, never a paid AI call.
  const itinerary={id:'synthetic-result',plan:{origin:'Test Origin',destination:'Test Destination',petType:'dog',departureDate:'2027-01-10'},result:{summary:'Synthetic generated itinerary',destination:['Fixture destination policy'],airline:['Fixture airline guidance'],timeline:[{when:'Before booking',action:'Fixture preparation'}],packing:['Fixture carrier'],questions:['Fixture question']},sources:[],evidence:{},generatedAt:new Date().toISOString()};
  const sessionRow=await database.collection('sessions').findOne({'session':{$regex:String(user._id)}});
  const sessionData=JSON.parse(sessionRow.session);sessionData.latestJourney=itinerary;
  await database.collection('sessions').updateOne({_id:sessionRow._id},{$set:{session:JSON.stringify(sessionData)}});
  assert.equal((await request('/my-trips/itinerary',{method:'POST',form:{resultId:'forged'}})).status,400);
  const savedItinerary=await request('/my-trips/itinerary',{method:'POST',form:{resultId:itinerary.id}});
  assert.equal(savedItinerary.status,200);const savedUrl=JSON.parse(savedItinerary.text).url;
  assert.equal((await request('/my-trips/itinerary',{method:'POST',form:{resultId:itinerary.id}})).status,200);
  const itineraryUser=await database.collection('users').findOne({_id:user._id});assert.equal(itineraryUser.researchPlans.length,2);
  assert.match((await request(savedUrl)).text,/Synthetic generated itinerary/);
  assert.ok(!(await request(savedUrl,{authenticated:false})).text.includes('Synthetic generated itinerary'));
  assert.match((await request('/my-trips')).text,/Open trip plan/);
  console.log('PASS generated itinerary persists in real MongoDB; server-owned save, forged-id rejection, deduplication, reopen and guest isolation');
  assert.match((await request('/my-trips')).text,/Test Origin/);
  for(const route of ['/admin','/admin/agent','/admin/airline-agent']) { const blocked=await request(route);assert.equal(blocked.status,302);assert.equal(blocked.location,'/'); }
  assert.ok(!(await request('/')).text.includes('href="/admin"'));
  await database.collection('users').updateOne({_id:user._id},{$set:{role:'admin'}});
  for(const route of ['/admin','/admin/agent','/admin/airline-agent']) assert.equal((await request(route)).status,200,'Admin page '+route);
  assert.ok((await request('/')).text.includes('href="/admin"'));
  await database.collection('users').updateOne({_id:user._id},{$set:{role:'user'}});
  await database.collection('stories').updateOne({slug:'synthetic-staging-journey'},{$set:{author:user._id}});
  const storyEdit=await request('/blog/synthetic-staging-journey/edit');
  assert.equal(storyEdit.status,200);assert.match(storyEdit.text,/name="country"/);assert.match(storyEdit.text,/storyCountries/);assert.match(storyEdit.text,/SYNTHETIC|Synthetic body/);
  assert.equal((await request('/blog/synthetic-staging-journey')).status,200);
  assert.equal((await request('/blog/new')).status,200);
  assert.match((await request('/blog/new')).text,/storyCountries/);
  console.log('PASS account saves, deduplication, invalid input, related SSR and guest/user/admin access');
  console.log('PASS registration, password hashing, authenticated dashboard and stored session');

  await stop(app);
  await startApp(uri);
  await protectedDashboard(true);
  assert.match((await request('/my-trips')).text,/Test Origin/);
  console.log('PASS session and saved research survive app restart');
  assert.equal((await request('/auth/logout')).status, 302);
  const loggedOut = await request('/dashboard');
  assert.equal(loggedOut.status, 302);
  const wrong = await request('/auth/login', { method: 'POST', form: { email, password: 'incorrect-staging-password' } });
  assert.equal(wrong.location, '/auth/login');
  assert.equal((await request('/dashboard')).status, 302);
  const correct = await request('/auth/login', { method: 'POST', form: { email, password } });
  assert.equal(correct.location, '/dashboard');
  await protectedDashboard(true);
  console.log('PASS logout, incorrect password rejection, correct password login');

  for (const provider of ['google', 'facebook']) {
    const initiation = await request(`/auth/${provider}`, { authenticated: false });
    assert.equal(initiation.status, 302);
    const destination = new URL(initiation.location);
    assert.equal(destination.protocol, 'https:');
    assert.ok(provider === 'google' ? destination.hostname === 'accounts.google.com' : destination.hostname.endsWith('.facebook.com'));
    assert.equal(destination.searchParams.get('redirect_uri'), `${base}/auth/${provider}/callback`);
  }
  console.log('PASS Google/Facebook initiation uses local callbacks (redirects inspected only; no provider requests)');
  if(process.argv.includes('--preview')) {
    console.log('PREVIEW READY http://127.0.0.1:3101/ (synthetic isolated database; no production credentials)');
    await new Promise(()=>{});
  }
  await invalidDatabaseStartup();
}

let cleanupPromise;
function cleanup() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
  await stop(app);
  if (client) await client.close().catch(() => {});
  await stop(mongo);
  // Only this runner's fresh directory is eligible for removal; no existing DB is dropped.
  if (dbDir && path.dirname(path.resolve(dbDir)) === path.join(root, '.staging') && path.basename(dbDir).startsWith('auth-test-')) {
    await fs.rm(dbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(error => {
      console.error(`Temporary staging directory cleanup failed: ${error.message}`);
      process.exitCode = 1;
    });
  }
  })();
  return cleanupPromise;
}

for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  process.exitCode = 1;
  cleanup().finally(() => process.exit(1));
});

main().catch(error => {
  console.error(`FAIL ${error.message}`);
  for (const [name, output] of Object.entries(logs)) {
    console.error(`[${name} log tail]\n${output.replaceAll(sessionSecret, '[redacted]').replaceAll(password, '[redacted]').replaceAll(email, '[synthetic-email]')}`);
  }
  process.exitCode = 1;
}).finally(cleanup);
