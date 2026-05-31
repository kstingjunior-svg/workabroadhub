// ─────────────────────────────────────────────────────────────────────────────
// usePageHead — minimal SEO head manager without react-helmet.
//
// Sets document.title and injects/updates <meta>, <link rel="canonical">,
// and <script type="application/ld+json"> tags. Cleans up on unmount.
// Idempotent — re-running with the same args is a no-op.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";

interface PageHead {
  title?: string;
  description?: string;
  canonical?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogUrl?: string;
  ogImage?: string;
  jsonLd?: Record<string, unknown>[];
}

function upsertMeta(attr: "name" | "property", key: string, value: string) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", value);
  return el;
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
  return el;
}

export function usePageHead(head: PageHead): void {
  useEffect(() => {
    const prevTitle = document.title;
    const created: HTMLElement[] = [];

    if (head.title) document.title = head.title;
    if (head.description)   upsertMeta("name", "description", head.description);
    if (head.canonical)     upsertLink("canonical", head.canonical);
    if (head.ogTitle)       upsertMeta("property", "og:title", head.ogTitle);
    if (head.ogDescription) upsertMeta("property", "og:description", head.ogDescription);
    if (head.ogUrl)         upsertMeta("property", "og:url", head.ogUrl);
    if (head.ogImage)       upsertMeta("property", "og:image", head.ogImage);
    if (head.ogTitle)       upsertMeta("name", "twitter:title", head.ogTitle);
    if (head.ogDescription) upsertMeta("name", "twitter:description", head.ogDescription);
    upsertMeta("name", "twitter:card", "summary_large_image");

    // JSON-LD blocks — added as fresh script nodes; tracked for cleanup.
    if (head.jsonLd?.length) {
      for (const block of head.jsonLd) {
        const s = document.createElement("script");
        s.type = "application/ld+json";
        s.dataset.pageHead = "1";
        s.text = JSON.stringify(block);
        document.head.appendChild(s);
        created.push(s);
      }
    }

    return () => {
      // Reset title; remove only the JSON-LD scripts we created.
      document.title = prevTitle;
      for (const node of created) node.remove();
    };
  }, [
    head.title,
    head.description,
    head.canonical,
    head.ogTitle,
    head.ogDescription,
    head.ogUrl,
    head.ogImage,
    JSON.stringify(head.jsonLd || []),
  ]);
}
