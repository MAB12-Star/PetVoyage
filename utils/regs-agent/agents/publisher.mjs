import { upsertCountryDoc } from "../db.mjs";

export async function publisherAgent({ coll, finalDoc }) {
  const nowIso = new Date().toISOString();

  const docToSave = {
    ...finalDoc,
    updatedAt: nowIso
  };

  const res = await upsertCountryDoc(coll, finalDoc.destinationCountry, docToSave);

  return {
    matchedCount: res.matchedCount,
    modifiedCount: res.modifiedCount,
    upsertedId: res.upsertedId ?? null
  };
}
