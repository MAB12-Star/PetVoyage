import fs from "fs/promises";
import path from "path";

export async function writeOutputJson({ airlineCode, data }) {
  const baseDir = path.resolve(process.cwd(), "utils/airline-agent/output");
  await fs.mkdir(baseDir, { recursive: true });

  const filePath = path.join(baseDir, `${String(airlineCode).toUpperCase()}.json`);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
  return filePath;
}

