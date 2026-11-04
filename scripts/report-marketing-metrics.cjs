// Aggregate existing nginx access logs from stdin; never output raw rows or identifiers.
const readline = require('node:readline');
const guides = require('../content/guides.json');
const paths = new Set(['/guides', ...guides.map(g => `/guides/${g.slug}`)]);
const since = process.argv[2] || '2026-11-04';
if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error('Expected YYYY-MM-DD');
const counts = {};
let parsed = 0, skipped = 0;
const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function aggregate(line) {
  const match = line.match(/\[(\d{2})\/(\w{3})\/(\d{4}):(\d{2}:\d{2}:\d{2}) ([+-]\d{4})\] "(?:GET|HEAD) ([^ ]+) HTTP\/[^\"]+" (\d{3}) /);
  if (!match) { skipped++; return; }
  const month = months.indexOf(match[2]);
  if (month < 0) { skipped++; return; }
  const time = new Date(`${match[3]}-${String(month+1).padStart(2,'0')}-${match[1]}T${match[4]}${match[5].slice(0,3)}:${match[5].slice(3)}`);
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(time);
  const part = key => parts.find(p=>p.type===key).value;
  const day = `${part('year')}-${part('month')}-${part('day')}`;
  if (day < since) return;
  let url; try { url = new URL(match[6], 'https://www.petvoyage.ai'); } catch { skipped++; return; }
  if (!paths.has(url.pathname)) return;
  parsed++;
  const source = ['facebook','instagram','google','bing'].includes(url.searchParams.get('utm_source')) ? url.searchParams.get('utm_source') : (url.searchParams.has('utm_source') ? 'other-tagged' : 'untagged');
  const campaign = url.searchParams.get('utm_campaign') === 'petvoyage_20261029_20261127' ? 'campaign' : 'other-or-untagged';
  const status = match[7];
  const bot = /bot|crawler|spider|facebookexternalhit|meta-externalagent/i.test(line.split('"').at(-2) || '') ? 'recognized-bot' : 'unclassified';
  const key = [day,url.pathname,source,campaign,status,bot].join('|');
  counts[key]=(counts[key]||0)+1;
}
async function main() {
  for await (const line of readline.createInterface({input:process.stdin,crlfDelay:Infinity})) aggregate(line);
  console.log(JSON.stringify({generatedAt:new Date().toISOString(),since,timezone:'America/Los_Angeles',method:'existing-nginx-log-aggregate',scope:'planning-guides-only',limitations:'Request counts, including validation requests; not unique people, sessions, outbound clicks, sales or conversion attribution. Unclassified includes unknown bots. Coverage depends on supplied log files.',matchedRequests:parsed,unparsedRows:skipped,rows:Object.entries(counts).map(([key,requests])=>{const [day,path,source,campaign,status,trafficClass]=key.split('|');return {day,path,source,campaign,status,trafficClass,requests};})},null,2));
}
if (require.main === module) main().catch(()=>{console.error('Aggregate report failed');process.exitCode=1;});
