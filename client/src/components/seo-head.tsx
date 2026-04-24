import { useEffect } from "react";

interface JsonLdSchema {
  "@context": string;
  "@type": string;
  [key: string]: unknown;
}

interface SeoHeadProps {
  title: string;
  description: string;
  keywords: string;
  canonicalPath?: string;
  schemas?: JsonLdSchema[];
}

export function SeoHead({ title, description, keywords, canonicalPath, schemas = [] }: SeoHeadProps) {
  useEffect(() => {
    document.title = title;

    const setMeta = (name: string, content: string, attr = "name") => {
      let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    setMeta("description", description);
    setMeta("keywords", keywords);
    setMeta("og:title", title, "property");
    setMeta("og:description", description, "property");
    setMeta("twitter:title", title, "property");
    setMeta("twitter:description", description, "property");

    if (canonicalPath) {
      let canon = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (!canon) {
        canon = document.createElement("link");
        canon.setAttribute("rel", "canonical");
        document.head.appendChild(canon);
      }
      canon.setAttribute("href", `https://workabroadhub.tech${canonicalPath}`);
    }

    document.querySelectorAll("[data-seo-jsonld]").forEach((el) => el.remove());

    schemas.forEach((schema) => {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.setAttribute("data-seo-jsonld", "true");
      script.textContent = JSON.stringify(schema);
      document.head.appendChild(script);
    });

    return () => {
      document.querySelectorAll("[data-seo-jsonld]").forEach((el) => el.remove());
    };
  }, [title, description, keywords, canonicalPath]);

  return null;
}

export function buildArticleSchema(opts: {
  title: string;
  description: string;
  url: string;
  datePublished?: string;
  author?: string;
}): JsonLdSchema {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: opts.title,
    description: opts.description,
    url: opts.url,
    datePublished: opts.datePublished ?? "2024-01-01",
    dateModified: new Date().toISOString().split("T")[0],
    author: {
      "@type": "Organization",
      name: opts.author ?? "WorkAbroad Hub",
    },
    publisher: {
      "@type": "Organization",
      name: "WorkAbroad Hub",
      url: "https://workabroadhub.tech",
    },
  };
}

export function buildFaqSchema(faqs: { q: string; a: string }[]): JsonLdSchema {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: {
        "@type": "Answer",
        text: a,
      },
    })),
  };
}
