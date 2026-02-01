import { updateAirlineByCode } from "../db.mjs";

export async function publisherAgent({ coll, existingAirline, finalDoc }) {
  const patch = { ...finalDoc };

  // never overwrite identity fields
  delete patch._id;
  delete patch.slug;
  delete patch.name;
  delete patch.reviews;
  delete patch.author;

  // never change the key we match on
  delete patch.airlineCode;

  // don't write undefined
  Object.keys(patch).forEach((k) => {
    if (patch[k] === undefined) delete patch[k];
  });

  const res = await updateAirlineByCode(coll, existingAirline.airlineCode, patch);
  return { matchedCount: res.matchedCount, modifiedCount: res.modifiedCount };
}
