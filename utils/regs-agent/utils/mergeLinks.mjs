// utils/mergeLinks.mjs
function normUrl(u) {
  return String(u || "").trim().replace(/\s+/g, "");
}

function keyOf(link) {
  return normUrl(link?.url).toLowerCase();
}

function mergeLinkArrays(a = [], b = []) {
  const out = [];
  const seen = new Set();

  for (const l of [...a, ...b]) {
    if (!l?.url) continue;
    const k = keyOf(l);
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ name: l.name || "Link", url: normUrl(l.url) });
  }
  return out;
}

/**
 * Preserves existing officialLinks and per-pet links.
 * Adds any newly found links on top, deduped by URL.
 */
export function mergeExistingLinks({ existing, draft }) {
  if (!existing || !draft) return draft;

  // top-level officialLinks
  draft.officialLinks = mergeLinkArrays(existing.officialLinks, draft.officialLinks);

  // per pet type links
  const exPets = existing.regulationsByPetType || {};
  const drPets = draft.regulationsByPetType || {};

  for (const [petKey, petVal] of Object.entries(drPets)) {
    const existingPet = exPets[petKey];
    if (!existingPet) continue;
    petVal.links = mergeLinkArrays(existingPet.links, petVal.links);
  }

  // also bring over petTypes that existed but extractor omitted (optional)
  // If you want to NEVER drop an existing pet type unless explicitly requested:
  // for (const [petKey, petVal] of Object.entries(exPets)) {
  //   if (!drPets[petKey]) drPets[petKey] = petVal;
  // }

  return draft;
}
