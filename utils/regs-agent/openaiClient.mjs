// utils/regs-agent/openaiClient.mjs
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";

// 🔹 Load root .env (same one app.js uses)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// openaiClient.mjs is in: utils/regs-agent/
// .env is in: project root
dotenv.config({ path: path.join(__dirname, "../../.env") });

// 🔹 Allow fallback key name if needed
const apiKey =
  process.env.OPENAI_API_KEY ||
  process.env.OPENAI_KEY ||
  process.env.openaiKey;

if (!apiKey) {
  throw new Error(
    "OPENAI_API_KEY is missing. Set it in the root .env file."
  );
}

export const openai = new OpenAI({ apiKey });
