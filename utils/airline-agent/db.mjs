import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { MongoClient } from "mongodb";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// airline-agent/db.mjs is in: utils/airline-agent/
// root .env is: project root
dotenv.config({ path: path.join(__dirname, "../../.env") });

const MONGODB_URI = process.env.MONGODB_URI || process.env.mongoKey;
const MONGODB_DB = process.env.MONGODB_DB || "test";
const AIRLINES_COLL = process.env.AIRLINES_COLL || "airlines";

if (!MONGODB_URI) throw new Error("Missing Mongo URI. Set MONGODB_URI or mongoKey in root .env");

export async function withDb(fn) {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  try {
    const db = client.db(MONGODB_DB);
    const coll = db.collection(AIRLINES_COLL);
    return await fn({ db, coll });
  } finally {
    await client.close();
  }
}

export async function listAirlines(coll) {
  return await coll
    .find({}, { projection: { airlineCode: 1, name: 1 } })
    .sort({ name: 1 })
    .toArray();
}

export async function getAirlineByCode(coll, airlineCode) {
  return await coll.findOne({ airlineCode: String(airlineCode).trim().toUpperCase() });
}

export async function updateAirlineByCode(coll, airlineCode, patch) {
  return await coll.updateOne(
    { airlineCode: String(airlineCode).trim().toUpperCase() },
    { $set: patch }
  );
}
