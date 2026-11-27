/**
 * ONE email-typo checker for server and client (2026-11-28, Tony).
 *
 * Before, the server and the sign-in modal each kept their own list of
 * misspellings, and both missed "gmai.com", "gmaim.com" and "1gmail.com" —
 * people who typed those never got their code. Now: exact known typos, then
 * a fuzzy match (1–2 letters off a big provider), with real look-alike
 * providers (ymail.com, mail.com, email.com, ...) never "corrected".
 */

const PROVIDERS = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com"] as const;

/** Real domains that look like typos but are not. Never suggest a change. */
const REAL_DOMAINS = new Set([
  ...PROVIDERS,
  "googlemail.com", "ymail.com", "rocketmail.com", "yahoo.co.uk", "yahoo.fr",
  "mail.com", "email.com", "gmx.com", "gmx.net", "aol.com", "live.com", "msn.com",
  "me.com", "mac.com", "proton.me", "protonmail.com", "zoho.com", "yandex.com",
  "hotmail.co.uk", "outlook.co.uk", "live.co.uk", "yahoo.co.ke", "hotmail.fr",
]);

const KNOWN_TYPOS: Readonly<Record<string, string>> = {
  "gmailcom": "gmail.com", "gmailc.om": "gmail.com", "gmail.co": "gmail.com",
  "gmail.cm": "gmail.com", "gmail.con": "gmail.com", "gmail.om": "gmail.com",
  "gmail.cim": "gmail.com", "gmail.vom": "gmail.com", "gmail.comm": "gmail.com",
  "gmail.coom": "gmail.com", "gmail.c": "gmail.com", "gmaio.co": "gmail.com",
  "gmil.co": "gmail.com",
  "yahoocom": "yahoo.com", "yahoo.co": "yahoo.com", "yahoo.con": "yahoo.com", "yahoo.cm": "yahoo.com",
  "hotmail.co": "hotmail.com", "hotmail.con": "hotmail.com", "hotmail.cm": "hotmail.com",
  "outlook.con": "outlook.com", "icloud.con": "icloud.com",
  "protonmai.com": "protonmail.com", "protomail.com": "protonmail.com", "proton.co": "proton.me",
};

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      // swapped neighbours ("gmial") count as one mistake
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[a.length][b.length];
}

/** Returns the corrected DOMAIN, or null when the domain looks fine. */
export function suggestEmailDomain(domainRaw: string): string | null {
  const domain = String(domainRaw || "").trim().toLowerCase();
  if (!domain || REAL_DOMAINS.has(domain)) return null;
  if (KNOWN_TYPOS[domain]) return KNOWN_TYPOS[domain];
  // "1gmail.com", "gmail1.com", "mygmail.com" style
  for (const p of PROVIDERS) {
    const name = p.split(".")[0];
    if (domain.endsWith(".com") && domain.includes(name) && domain !== p && domain.length <= p.length + 2) return p;
  }
  let best: string | null = null;
  let bestD = Infinity;
  for (const p of PROVIDERS) {
    const d = editDistance(domain, p);
    if (d < bestD) { bestD = d; best = p; }
  }
  // 1 mistake always; 2 only for longer domains (avoids "aol.com"-type clashes)
  if (best && (bestD === 1 || (bestD === 2 && domain.length >= 8))) return best;
  return null;
}

/** Returns the corrected full EMAIL, or null. */
export function suggestEmailFix(emailRaw: string): string | null {
  const email = String(emailRaw || "").trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const local = email.slice(0, at);
  const fixed = suggestEmailDomain(email.slice(at + 1));
  return fixed ? `${local}@${fixed}` : null;
}
