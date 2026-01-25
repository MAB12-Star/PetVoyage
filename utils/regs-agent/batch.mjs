// batch.mjs
import { spawn } from "node:child_process";
import fs from "node:fs";

const COUNTRIES = [
  //"Bahamas",
//"Barbados",
//"Belarus",
//"Belize",
//"Bermuda",
//"Bolivia",
//"Botswana",
"British Virgin Islands",

  // add more here
];

const OUT_DIR = "./batch-logs";
fs.mkdirSync(OUT_DIR, { recursive: true });

function runOne(country) {
  return new Promise((resolve) => {
    console.log(`\n==============================`);
    console.log(`🚀 Running: ${country}`);
    console.log(`==============================\n`);

    const logPath = `${OUT_DIR}/${country.replace(/[^\w.-]+/g, "_")}.log`;
    const log = fs.createWriteStream(logPath, { flags: "a" });

    const p = spawn("node", ["index.mjs", country], {
      env: process.env,
      shell: false
    });

    p.stdout.on("data", (d) => {
      process.stdout.write(d);
      log.write(d);
    });

    p.stderr.on("data", (d) => {
      process.stderr.write(d);
      log.write(d);
    });

    p.on("close", (code) => {
      log.end();
      console.log(`\n🏁 Finished: ${country} (exit ${code})`);
      resolve({ country, code, logPath });
    });
  });
}

const results = [];
for (const country of COUNTRIES) {
  // eslint-disable-next-line no-await-in-loop
  const r = await runOne(country);
  results.push(r);

  // write rolling summary
  fs.writeFileSync(
    `${OUT_DIR}/summary.json`,
    JSON.stringify(results, null, 2),
    "utf8"
  );
}

console.log("\n✅ All done. Summary written to batch-logs/summary.json");
