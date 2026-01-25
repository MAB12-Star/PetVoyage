// utils/regs-agent/db.mjs
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { MongoClient } from "mongodb";

// ✅ Load PetVoyage root .env (located at project root, same level as app.js)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// db.mjs is: /utils/regs-agent/db.mjs
// root .env is: / .env
dotenv.config({ path: path.join(__dirname, "../../.env") });

// ✅ Env mapping: prefer MONGODB_URI, fallback to your existing PetVoyage mongoKey
const MONGODB_URI = process.env.MONGODB_URI || process.env.mongoKey;
const MONGODB_DB = process.env.MONGODB_DB || "test";
const MONGODB_COLL = process.env.MONGODB_COLL || "country_regulations_list";

if (!MONGODB_URI) {
  throw new Error("Missing Mongo URI. Set MONGODB_URI or mongoKey in root .env");
}

export async function withDb(fn) {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  try {
    const db = client.db(MONGODB_DB);
    const coll = db.collection(MONGODB_COLL);
    return await fn({ db, coll });
  } finally {
    await client.close();
  }
}

export async function getCountryDocByName(coll, countryName) {
  return await coll.findOne({ destinationCountry: countryName });
}

export async function upsertCountryDoc(coll, destinationCountry, doc) {
  return await coll.updateOne(
    { destinationCountry },
    { $set: doc },
    { upsert: true }
  );
}
