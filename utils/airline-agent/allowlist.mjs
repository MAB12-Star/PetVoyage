function safeHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function buildAllowedHostsFromAirline(airlineDoc, manualUrls = []) {
  const hosts = new Set();

  const add = (u) => {
    const h = safeHost(u);
    if (h) hosts.add(h);
  };

  add(airlineDoc?.airlineURL);
  add(airlineDoc?.petPolicyURL);

  for (const u of manualUrls || []) add(u);

  return hosts;
}

export function isAllowedUrl(url, allowedHosts) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    for (const allowed of allowedHosts) {
      if (host === allowed) return true;
      if (host.endsWith("." + allowed)) return true;
    }
    return false;
  } catch {
    return false;
  }
}
