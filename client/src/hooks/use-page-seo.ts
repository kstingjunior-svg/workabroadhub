/**
 * usePageSeo — set unique <title>, <meta description>, canonical, and
 * OpenGraph tags on the current page.
 *
 * 2026-08 (Tony's Google Search Console audit): the site's #1 SEO problem
 * was that EVERY route served the same homepage <title> and <meta
 * description> from index.html. Google saw dozens of "duplicate" pages,
 * demoted them all, and only indexed the homepage. That's why 97 % of
 * traffic went to `/` and every other page got a rounding error.
 *
 * This hook fixes that with zero dependencies — no react-helmet, no
 * provider. Runs in a useEffect on route mount, updates the DOM tags
 * directly. When the component unmounts we restore the last-set value so
 * back-navigation doesn't leave a stale <title>.
 *
 * Usage:
 *   usePageSeo({
 *     title: "Visit-visa guide for every country — WorkAbroad Hub",
 *     description: "Real official portals and Nairobi application centres…",
 *     path: "/visit-visas",             // for canonical URL
 *     ogImage: "/logo.png",             // optional; defaults to /logo.png
 *   });
 */

import { useEffect } from "react";

const BASE_URL = "https://workabroadhub.tech";
const DEFAULT_TITLE = "WorkAbroad Hub — Verified Overseas Jobs for Kenyans";
const DEFAULT_OG_IMAGE = "https://workabroadhub.tech/logo.png";

export interface PageSeo {
  title:       string;
  description: string;
  path?:       string;     // relative path (leading /). Used to build canonical.
  ogImage?:    string;     // full URL or absolute path (auto-prefixed with domain)
  noIndex?:    boolean;    // true → adds <meta robots="noindex,nofollow">
  keywords?:   string[];   // optional per-page keywords
}

export function usePageSeo(seo: PageSeo): void {
  const {
    title,
    description,
    path,
    ogImage = DEFAULT_OG_IMAGE,
    noIndex = false,
    keywords,
  } = seo;

  useEffect(() => {
    // Save current values so we can restore on unmount
    const prevTitle = document.title;

    document.title = title;
    setMeta("name",     "description",           description);
    setMeta("name",     "twitter:description",   description);
    setMeta("property", "og:title",              title);
    setMeta("property", "og:description",        description);
    setMeta("property", "twitter:title",         title);
    setMeta("name",     "twitter:card",          "summary_large_image");

    const canonical = path
      ? `${BASE_URL}${path.startsWith("/") ? path : "/" + path}`
      : window.location.href.split("?")[0].split("#")[0];
    setLink("canonical", canonical);
    setMeta("property", "og:url", canonical);

    const ogImageUrl = ogImage.startsWith("http") ? ogImage : `${BASE_URL}${ogImage}`;
    setMeta("property", "og:image", ogImageUrl);
    setMeta("name", "twitter:image", ogImageUrl);

    if (noIndex) {
      setMeta("name", "robots", "noindex,nofollow");
    } else {
      setMeta("name", "robots", "index,follow");
    }

    if (keywords && keywords.length) {
      setMeta("name", "keywords", keywords.join(", "));
    }

    return () => {
      document.title = prevTitle || DEFAULT_TITLE;
      // We deliberately do NOT restore meta tags — the next page's usePageSeo
      // will overwrite them within a single React commit. Leaving them as-is
      // between navigations avoids a visible flash of default text.
    };
  }, [title, description, path, ogImage, noIndex, keywords?.join("|")]);
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function setMeta(attr: "name" | "property", key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setLink(rel: string, href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}
