/** Pure: registry / DNS results → evidence findings. */
import { makeFinding, type Finding } from "./evidence";
import { getSource } from "./sources";
import type { DomainCheck, RegistryLookupResult } from "./employer-lookup";

const FREE_EMAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com", "outlook.com", "live.com",
  "aol.com", "icloud.com", "protonmail.com", "proton.me", "yandex.com", "mail.com", "zoho.com", "gmx.com",
]);
const DISPOSABLE_EMAIL = new Set(["10minutemail.com", "guerrillamail.com", "mailinator.com", "temp-mail.org", "tempmail.com", "throwawaymail.com"]);

function src(id: string, retrievedAt: string | null) {
  const s = getSource(id)!;
  return { sourceId: s.id, authority: s.authority, url: s.url, retrievedAt };
}

export function ukSponsorFindings(r: RegistryLookupResult, claimsSponsorship: boolean): Finding[] {
  const s = getSource("uk_sponsor_register")!;
  const when = r.retrievedAt ? new Date(r.retrievedAt).toISOString().slice(0, 10) : "unknown date";
  if (r.outcome === "unavailable" || r.stale) {
    return [makeFinding({
      code: "uk_sponsor_register_unavailable", status: "unable_to_verify", priority: "medium",
      title: "UK sponsor register could not be checked",
      examined: `Whether "${r.queriedName}" holds a UK sponsor licence.`,
      evidenceSays: r.retrievedAt ? `Our copy of the register is out of date (last successful update ${when}).` : "Our copy of the official register is not available right now.",
      howToVerify: "Search the employer's name in the official register of licensed sponsors.",
      howToVerifyUrl: s.url, method: "registry_lookup", check: { name: "uk_sponsor_lookup", version: 1, result: r.outcome },
    })];
  }
  if (r.outcome === "match") {
    const m = r.matches[0];
    return [makeFinding({
      code: "uk_sponsor_listed", status: "consistent_with_requirements", priority: "medium",
      title: "Employer appears on the UK register of licensed sponsors",
      examined: `The employer name "${r.queriedName}" against the UK Home Office register of licensed sponsors.`,
      documentSays: `Employer: ${r.queriedName}`,
      evidenceSays: `An organisation named "${m.name}"${m.town ? ` (${m.town})` : ""} is listed — ${m.typeRating ?? "rating not shown"}, route: ${m.route ?? "not shown"}. Register as published on ${when}.`,
      whyItMatters: "UK employers must hold a sponsor licence to sponsor a Skilled Worker or Temporary Worker visa.",
      uncertainty: "This shows the organisation holds a licence. It does not confirm that this letter was issued by them, or that the person who sent it works there. Contact the company through the details on its own official website.",
      howToVerify: "Search the register yourself and contact the employer through its official website, not the details in the letter.",
      howToVerifyUrl: s.url, source: { ...src("uk_sponsor_register", r.retrievedAt), ruleId: "GB.SPONSOR.LICENSED", ruleVersion: 1 },
      method: "registry_lookup", check: { name: "uk_sponsor_lookup", version: 1, result: "match" },
    })];
  }
  const close = r.outcome === "close_matches" ? r.matches.map((m) => `"${m.name}"${m.town ? ` (${m.town})` : ""}`).join(", ") : "";
  return [makeFinding({
    code: "uk_sponsor_not_found",
    status: claimsSponsorship ? "potential_risk_indicator" : "unable_to_verify",
    priority: claimsSponsorship ? "high" : "medium",
    title: "No exact match on the UK register of licensed sponsors",
    examined: `The employer name "${r.queriedName}" against the UK register of licensed sponsors (published ${when}).`,
    evidenceSays: close ? `No exact match. Similar names on the register: ${close}.` : "No organisation with this exact name is on the register.",
    whyItMatters: claimsSponsorship
      ? "The letter mentions visa sponsorship. A UK employer must hold a sponsor licence to sponsor a work visa."
      : "If the role needs UK visa sponsorship, the employer must hold a sponsor licence.",
    uncertainty: "Registered names can differ from trading names, and a parent or group company may hold the licence. A missing exact match is not proof of anything.",
    howToVerify: "Ask the employer for the exact legal name on its sponsor licence and search the official register.",
    howToVerifyUrl: s.url, source: src("uk_sponsor_register", r.retrievedAt),
    method: "registry_lookup", check: { name: "uk_sponsor_lookup", version: 1, result: r.outcome },
  })];
}

export function neaFindings(r: RegistryLookupResult, letterLicence: string | null): Finding[] {
  const s = getSource("ke_nea_register")!;
  const when = r.retrievedAt ? new Date(r.retrievedAt).toISOString().slice(0, 10) : "unknown date";
  if (r.outcome === "unavailable" || r.stale) {
    return [makeFinding({
      code: "nea_register_unavailable", status: "unable_to_verify", priority: "low",
      title: "NEA agency register could not be checked",
      examined: `Whether the recruitment agency "${r.queriedName}" holds an NEA licence.`,
      evidenceSays: "Our copy of the NEA register is not current.", howToVerify: "Search the agency on the NEA register.",
      howToVerifyUrl: s.url, method: "registry_lookup", check: { name: "nea_lookup", version: 1, result: r.outcome },
    })];
  }
  if (r.outcome === "no_match") {
    return [makeFinding({
      code: "nea_agency_not_found", status: "unable_to_verify", priority: "medium",
      title: "Recruitment agency not found on the NEA register",
      examined: `The agency "${r.queriedName}" against the National Employment Authority register (synced ${when}).`,
      evidenceSays: "No agency with this exact name or licence number is on our copy of the register.",
      whyItMatters: "Kenyan agencies recruiting for jobs abroad are licensed by the NEA. Using a licensed agency gives you a route to complain if something goes wrong.",
      uncertainty: "The agency may trade under a different name, or the name may have been read incorrectly.",
      howToVerify: "Ask the agency for its NEA licence number and search for it on the NEA register.",
      howToVerifyUrl: s.url, source: src("ke_nea_register", r.retrievedAt),
      method: "registry_lookup", check: { name: "nea_lookup", version: 1, result: "no_match" },
    })];
  }
  const m = r.matches[0];
  const today = new Date().toISOString().slice(0, 10);
  const expired = !!m.licenceExpiry && m.licenceExpiry < today;
  const deregistered = /deregist|revok|suspend/i.test(m.licenceStatus ?? "");
  if (expired || deregistered) {
    return [makeFinding({
      code: "nea_licence_not_current",
      status: r.licenceNumberMatched ? "confirmed_discrepancy" : "potential_risk_indicator",
      priority: "high",
      title: "Agency's NEA licence is not current",
      examined: `The agency "${r.queriedName}"${letterLicence ? ` and licence number ${letterLicence}` : ""} against the NEA register (synced ${when}).`,
      documentSays: letterLicence ? `Licence number printed: ${letterLicence}` : `Agency named: ${r.queriedName}`,
      evidenceSays: `The register lists "${m.name}"${m.licenceNumber ? ` (licence ${m.licenceNumber})` : ""} with ${deregistered ? `status "${m.licenceStatus}"` : `licence expiry ${m.licenceExpiry}`}.`,
      whyItMatters: "An agency without a current licence should not be recruiting Kenyans for jobs abroad.",
      uncertainty: r.licenceNumberMatched ? undefined : "Matched by name only — a different agency could share this name.",
      howToVerify: "Check the agency's current status on the NEA register before paying anything.",
      howToVerifyUrl: s.url, source: src("ke_nea_register", r.retrievedAt),
      documentRefs: letterLicence ? [{ field: "agencyLicenceNumber", value: letterLicence, ocrConfidence: null }] : undefined,
      method: "registry_lookup", check: { name: "nea_lookup", version: 1, result: { expired, deregistered } },
    })];
  }
  return [makeFinding({
    code: "nea_agency_listed", status: "consistent_with_requirements", priority: "low",
    title: "Agency appears on the NEA register",
    examined: `The agency "${r.queriedName}" against the NEA register (synced ${when}).`,
    evidenceSays: `"${m.name}" is listed${m.licenceExpiry ? ` with a licence valid until ${m.licenceExpiry}` : ""}.`,
    uncertainty: "This confirms the agency is licensed, not that this specific job or letter is real.",
    howToVerify: "Contact the agency through the details on the NEA register, not the details in the letter.",
    howToVerifyUrl: s.url, source: src("ke_nea_register", r.retrievedAt),
    method: "registry_lookup", check: { name: "nea_lookup", version: 1, result: "match" },
  })];
}

export function emailDomainFindings(
  email: string | null, websiteDomain: string | null, dnsCheck: DomainCheck | null,
): Finding[] {
  const out: Finding[] = [];
  const domain = (email ?? "").split("@")[1]?.toLowerCase() ?? "";
  if (!email || !domain) {
    out.push(makeFinding({
      code: "no_contact_email", status: "unable_to_verify", priority: "low",
      title: "No contact email to check",
      examined: "Recruiter / HR email address.", evidenceSays: "No email address was found in the document.",
      howToVerify: "Find the employer's official website independently and contact HR through it.",
      method: "deterministic", check: { name: "email_present", version: 1, result: false },
    }));
    return out;
  }
  if (DISPOSABLE_EMAIL.has(domain)) {
    out.push(makeFinding({
      code: "disposable_email", status: "potential_risk_indicator", priority: "high",
      title: "Disposable email address",
      examined: "Recruiter / HR email domain.", documentSays: `Email domain: ${domain}`,
      evidenceSays: `${domain} is a temporary, throw-away email service.`,
      whyItMatters: "Throw-away addresses cannot be traced back to an organisation.",
      howToVerify: "Contact the employer through its official website.",
      documentRefs: [{ field: "recruiterEmail", value: email, ocrConfidence: null }],
      method: "deterministic", check: { name: "email_domain_class", version: 1, result: "disposable" },
    }));
  } else if (FREE_EMAIL.has(domain)) {
    out.push(makeFinding({
      code: "free_email_provider", status: "potential_risk_indicator", priority: "low",
      title: "Free email provider used",
      examined: "Recruiter / HR email domain.", documentSays: `Email domain: ${domain}`,
      evidenceSays: `${domain} is a free public email service, not an organisation's own domain.`,
      whyItMatters: "Larger employers usually use their own domain. Small businesses sometimes use free email, so this is only a reason to double-check.",
      howToVerify: "Ask for an email from the company's own domain, and confirm that domain appears on the company's official website.",
      documentRefs: [{ field: "recruiterEmail", value: email, ocrConfidence: null }],
      method: "deterministic", check: { name: "email_domain_class", version: 1, result: "free" },
    }));
  } else {
    if (dnsCheck && dnsCheck.resolved === false) {
      out.push(makeFinding({
        code: "email_domain_does_not_exist", status: "confirmed_discrepancy", priority: "high",
        title: "Email domain does not exist",
        examined: `A DNS lookup for ${domain} on ${dnsCheck.checkedAt.slice(0, 10)}.`,
        documentSays: `Email: ${email}`,
        evidenceSays: `The domain ${domain} is not registered or has no DNS records, so it cannot send or receive email.`,
        whyItMatters: "A real company's contact email has to use a working domain.",
        uncertainty: "If the address was read incorrectly from the image, correct it and re-check.",
        howToVerify: "Check the address character by character against the original letter.",
        documentRefs: [{ field: "recruiterEmail", value: email, ocrConfidence: null }],
        method: "deterministic", check: { name: "dns_lookup", version: 1, result: dnsCheck },
      }));
    } else if (dnsCheck && dnsCheck.hasMx === false && dnsCheck.resolved) {
      out.push(makeFinding({
        code: "email_domain_no_mx", status: "potential_risk_indicator", priority: "medium",
        title: "Email domain has no mail server",
        examined: `MX records for ${domain} on ${dnsCheck.checkedAt.slice(0, 10)}.`,
        evidenceSays: `${domain} exists but publishes no mail-server (MX) records.`,
        whyItMatters: "Without mail servers, the domain normally cannot receive replies.",
        documentRefs: [{ field: "recruiterEmail", value: email, ocrConfidence: null }],
        method: "deterministic", check: { name: "dns_mx", version: 1, result: dnsCheck },
      }));
    }
    if (websiteDomain) {
      const a = domain.replace(/^.*?([^.]+\.[^.]+(\.[a-z]{2})?)$/, "$1");
      const same = domain === websiteDomain || domain.endsWith("." + websiteDomain) || websiteDomain.endsWith("." + domain) || a === websiteDomain;
      if (!same) {
        out.push(makeFinding({
          code: "email_website_domain_differs", status: "potential_risk_indicator", priority: "medium",
          title: "Email domain differs from the website in the letter",
          examined: "Recruiter email domain vs company website domain (both as printed in the letter).",
          documentSays: `Email domain ${domain}; website ${websiteDomain}`,
          whyItMatters: "Impersonators often register look-alike domains. Groups and subsidiaries can also legitimately use different domains.",
          howToVerify: "Open the company's website by searching for it yourself (not via links in the letter) and check which email domain it lists.",
          method: "deterministic", check: { name: "domain_compare", version: 1, result: { domain, websiteDomain } },
        }));
      }
    }
  }
  return out;
}
