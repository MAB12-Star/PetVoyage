import fs from "fs/promises";
import path from "path";

function safeStamp() {
  // 2026-01-28T22-11-33-600Z style
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export async function writeAudit({ airlineCode, dryRun, researchPayload, finalDoc }) {
  const baseDir = path.resolve(process.cwd(), "utils/airline-agent/audits");
  await fs.mkdir(baseDir, { recursive: true });

  const fileName = `${airlineCode}.${dryRun ? "dry" : "publish"}.${safeStamp()}.json`;
  const filePath = path.join(baseDir, fileName);

  const payload = {
    airlineCode,
    dryRun,
    ranAt: new Date().toISOString(),
    researchPayload,
    finalDoc,
  };

  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
  return filePath;
}

export async function readLatestAudit({ airlineCode }) {
  airlineCode = String(airlineCode || "").trim().toUpperCase();
  if (!airlineCode) throw new Error("airlineCode is required");

  const baseDir = path.resolve(process.cwd(), "utils/airline-agent/audits");
  try {
    const files = await fs.readdir(baseDir);
    const matches = files
      .filter((f) => f.startsWith(airlineCode + ".") && f.endsWith(".json"))
      .map((f) => path.join(baseDir, f));

    if (!matches.length) return { found: false };

    // Pick newest by mtime
    const stats = await Promise.all(matches.map(async (p) => ({ p, st: await fs.stat(p) })));
    stats.sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);

    const auditPath = stats[0].p;
    const raw = await fs.readFile(auditPath, "utf-8");
    const json = JSON.parse(raw);
    return { found: true, auditPath, ...json };
  } catch (err) {
    // directory doesn't exist or can't read
    return { found: false, error: err.message || String(err) };
  }
}
