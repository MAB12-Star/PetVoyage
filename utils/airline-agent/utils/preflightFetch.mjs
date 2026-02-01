// utils/airline-agent/utils/preflightFetch.mjs
import { withTimeout } from "./timeout.mjs";


function looksBlocked(html = "") {
  const s = html.toLowerCase();
  return (
    s.includes("access denied") ||
    s.includes("forbidden") ||
    s.includes("cloudflare") ||
    s.includes("attention required") ||
    s.includes("verify you are human") ||
    s.includes("captcha") ||
    s.includes("request blocked") ||
    s.includes("unusual traffic")
  );
}

function stripHtml(html = "") {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function preflightFetch(url, { timeoutMs = 20000 } = {}) {
  const start = Date.now();
  try {
    const resp = await withTimeout(
      fetch(url, {
        redirect: "follow",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      }),
      timeoutMs,
      `preflightFetch ${url}`
    );

    const contentType = resp.headers.get("content-type") || "";
    const status = resp.status;
    const finalUrl = resp.url || url;

    const buf = await resp.arrayBuffer();
    const bytes = buf.byteLength;

    let html = "";
    if (contentType.includes("text/html")) {
      html = new TextDecoder("utf-8").decode(buf);
    }

    const text = html ? stripHtml(html) : "";
    const blocked = html ? looksBlocked(html) : false;

    // JS-heavy heuristic (common reason we “get nothing”)
    const jsHeavy = html && text.length < 400 && html.length > 6000;

    return {
      ok: resp.ok,
      url,
      finalUrl,
      status,
      contentType,
      bytes,
      blocked,
      jsHeavy,
      readableChars: text.length,
      textSample: text.slice(0, 1500),
      durationMs: Date.now() - start,
      error: null,
    };
  } catch (e) {
    return {
      ok: false,
      url,
      finalUrl: null,
      status: null,
      contentType: null,
      bytes: 0,
      blocked: false,
      jsHeavy: false,
      readableChars: 0,
      textSample: "",
      durationMs: Date.now() - start,
      error: e?.message || String(e),
    };
  }
}

