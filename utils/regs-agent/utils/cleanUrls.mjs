// utils/cleanUrls.mjs
function cleanUrl(u) {
  return String(u || "").replace(/\s+/g, "").trim();
}

export function cleanDocUrls(doc) {
  // officialLinks
  if (Array.isArray(doc?.officialLinks)) {
    doc.officialLinks = doc.officialLinks
      .map(x => ({ ...x, url: cleanUrl(x.url) }))
      .filter(x => x.name && x.url);
  }

  // regulationsByPetType links
  const regs = doc?.regulationsByPetType;
  if (regs && typeof regs === "object") {
    for (const k of Object.keys(regs)) {
      const links = regs[k]?.links;
      if (Array.isArray(links)) {
        regs[k].links = links
          .map(x => ({ ...x, url: cleanUrl(x.url) }))
          .filter(x => x.name && x.url);
      }
    }
  }

  return doc;
}
