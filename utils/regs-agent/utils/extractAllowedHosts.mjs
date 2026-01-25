// utils/extractAllowedHosts.mjs
export function extractHostsFromExisting(existingDoc) {
  const hosts = new Set();

  if (!existingDoc) return hosts;

  const collect = (url) => {
    try {
      const u = new URL(url);
      hosts.add(u.hostname.toLowerCase());
    } catch {}
  };

  // officialLinks
  (existingDoc.officialLinks || []).forEach(l => collect(l.url));

  // per-pet links
  Object.values(existingDoc.regulationsByPetType || {}).forEach(pet => {
    (pet.links || []).forEach(l => collect(l.url));
  });

  return hosts;
}
