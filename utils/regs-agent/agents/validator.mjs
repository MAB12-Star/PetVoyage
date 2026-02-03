// utils/regs-agent/agents/validator.mjs
import { CountryPetRegulationSchema } from "../schema.mjs";
import { isAllowedUrl } from "../policy.mjs";
import { openai } from "../openaiClient.mjs";
import { withTimeout } from "../utils/timeout.mjs";

const UPLOAD_PATH_PREFIX = "/uploads/agent-pdfs/";

/**
 * Allow OUR internal uploaded PDFs even though they are not gov domains.
 * Accepts:
 * - https://localhost:3000/uploads/agent-pdfs/....
 * - https://127.0.0.1:3000/uploads/agent-pdfs/....
 * - https://YOUR_DOMAIN/uploads/agent-pdfs/.... (if PUBLIC_BASE_URL is set)
 */
function isAllowedAgentUploadUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return false;

  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return false; // not a valid absolute URL
  }

  if (!u.pathname.startsWith(UPLOAD_PATH_PREFIX)) return false;

  const host = (u.hostname || "").toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") return true;

  const base = (process.env.PUBLIC_BASE_URL || "").trim();
  if (base) {
    try {
      const baseHost = new URL(base).hostname.toLowerCase();
      if (host === baseHost) return true;
    } catch {
      // ignore bad env
    }
  }

  return false;
}

function isAllowedUrlOrAgentUpload(url) {
  return isAllowedUrl(url) || isAllowedAgentUploadUrl(url);
}

export function hardValidate(doc) {
  const parsed = CountryPetRegulationSchema.parse(doc);

  if (!parsed.officialLinks || parsed.officialLinks.length === 0) {
    throw new Error("officialLinks must not be empty.");
  }

  for (const link of parsed.officialLinks) {
    if (!isAllowedUrlOrAgentUpload(link.url)) {
      throw new Error(`Disallowed officialLinks URL: ${link.url}`);
    }
  }

  for (const [petType, details] of Object.entries(parsed.regulationsByPetType || {})) {
    if (/^\d+$/.test(petType)) throw new Error(`Invalid petType key (numeric): ${petType}`);

    for (const link of details.links || []) {
      if (!isAllowedUrlOrAgentUpload(link.url)) {
        throw new Error(`Disallowed link in ${petType}: ${link.url}`);
      }
    }
  }

  return parsed;
}

export async function validatorAgentExplain({ draftDoc, operatorNotes = "" }) {
  const notes = String(operatorNotes || "").trim();

  const prompt = `
You are the VALIDATOR agent (explain-only).

Return ONLY JSON:
{ "ok": boolean, "issues": string[] }

Check for:
- schema mismatches
-
- suspicious invented details not supported by official sources summary
- missing critical requirements hinted by operator notes (if any)
- conflicts between operator notes and the document

Operator notes (human corrections; may indicate missing items):
${notes ? notes : "(none)"}

JSON:
${JSON.stringify(draftDoc).slice(0, 60000)}
`;

  const resp = await withTimeout(
    openai.responses.create({
      model: "gpt-5",
      input: prompt,
      text: { format: { type: "json_object" } }
    }),
    45000,
    "validator explain"
  );

  return JSON.parse(resp.output_text);
}
