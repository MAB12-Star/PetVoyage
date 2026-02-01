import { runAirlineAgent } from "./agents/runAirlineAgent.mjs";

const airlineCode = process.argv[2];
if (!airlineCode) {
  console.error("Usage: node utils/airline-agent/index.mjs <AIRLINE_CODE> [--publish]");
  process.exit(1);
}

const publish = process.argv.includes("--publish");

const result = await runAirlineAgent({
  airlineCode: airlineCode.toUpperCase(),
  dryRun: !publish,
  researchMode: "seed_first",
  manualUrls: [],
  operatorNotes: "",
  onProgress: (m) => console.log(m),
});

console.log(JSON.stringify(result, null, 2));
