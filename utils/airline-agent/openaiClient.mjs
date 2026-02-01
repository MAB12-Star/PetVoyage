import OpenAI from "openai";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../../.env") });

const apiKey = process.env.openaiKey;
if (!apiKey) throw new Error("Missing OPENAI_API_KEY in .env");

export const openai = new OpenAI({ apiKey });
