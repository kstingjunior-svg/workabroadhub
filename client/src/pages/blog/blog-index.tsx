/**
 * /blog — public blog index listing all posts, filterable by category.
 *
 * 2026-08: launched with 5 SEO-optimised posts targeting the
 * highest-value long-tail queries from our Google Search Console data
 * (CV writing kenya, uk skilled worker visa kenya, canada express entry
 * kenya, certificate of good conduct, fake recruitment agencies).
 */

import { useMemo, useState } from "react";
import { Link } from "wouter";
import { usePageSeo } from "@/hooks/use-page-seo";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, ArrowRight, Clock, User } from "lucide-react";
import { POSTS } from "./posts";

export default function BlogIndex() {
  usePageSeo({
    title:       "WorkAbroad Hub Blog — Career, Visa & Overseas Job Guides for Kenyans",
    description: "Practical guides for Kenyans working abroad: CV writing, visa applications, recruitment scam protection, and country-specific pathways for UK, Canada, USA, Australia, UAE and more.",
    path:        "/blog",
    keywords:    ["kenya overseas jobs blog", "workabroad hub blog", "kenya career guides", "kenya visa guides"],
  });

  const [category, setCategory] = useState<string>("All");

  const categories = useMemo(() => {
    const set = new Set<string>();
    POSTS.forEach((p) => set.add(p.category));
    return ["All", ...Array.from(set).sort()];
  }, []);

  const visible = useMemo(() => {
    return POSTS
      .filter((p) => category === "All" || p.category === category)
      .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  }, [category]);

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-600 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
          <div className="flex items-center gap-2 text-sm mb-3 text-blue-100/80">
            <Link href="/"><span className="hover:text-white cursor-pointer">Home</span></Link>
            <span>/</span>
            <span>Blog</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mb-4 flex items-center gap-3">
            <BookOpen className="h-8 w-8 sm:h-10 sm:w-10" /> WorkAbroad Hub Blog
          </h1>
          <p className="text-base sm:text-lg text-blue-100/90 max-w-3xl leading-relaxed">
            Practical, up-to-date guides written by our founder Antony Macloud and reviewed
            by professionals actively working in the field. No fluff, no clickbait — just
            the information Kenyans applying for overseas jobs actually need.
          </p>
        </div>
      </section>

      {/* Category filter */}
      <section className="border-b bg-muted/30 sticky top-0 z-30 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex gap-2 flex-wrap">
          {categories.map((c) => (
            <Button
              key={c}
              variant={category === c ? "default" : "outline"}
              size="sm"
              onClick={() => setCategory(c)}
              data-testid={`blog-category-${c.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {c}
            </Button>
          ))}
        </div>
      </section>

      {/* Posts grid */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {visible.map((post) => (
            <Link key={post.slug} href={`/blog/${post.slug}`}>
              <Card
                className="cursor-pointer overflow-hidden hover:shadow-xl transition-all duration-300 hover:-translate-y-1 h-full flex flex-col"
                data-testid={`blog-card-${post.slug}`}
              >
                <div className="bg-gradient-to-br from-blue-500/10 via-indigo-500/10 to-purple-500/10 h-32 flex items-center justify-center text-5xl">
                  {post.heroEmoji}
                </div>
                <CardContent className="p-5 flex flex-col flex-1">
                  <Badge variant="outline" className="w-fit mb-2 text-xs">{post.category}</Badge>
                  <h2 className="font-bold text-lg leading-tight mb-2">{post.title}</h2>
                  <p className="text-sm text-muted-foreground line-clamp-3 mb-4 flex-1">{post.excerpt}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><User className="h-3 w-3" /> {post.author}</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {post.readMinutes} min</span>
                    <span>{new Date(post.publishedAt).toLocaleDateString("en-KE", { month: "short", day: "numeric", year: "numeric" })}</span>
                  </div>
                  <div className="mt-3 text-sm font-medium text-blue-600 flex items-center gap-1">
                    Read article <ArrowRight className="h-3 w-3" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {visible.length === 0 && (
          <p className="text-center text-muted-foreground py-16">No posts in this category yet.</p>
        )}
      </section>

      {/* CTA */}
      <section className="bg-slate-900 text-white py-14 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center space-y-4">
          <h2 className="text-2xl sm:text-3xl font-bold">Ready to take the next step?</h2>
          <p className="text-blue-100/80">
            Start with the free ATS CV Checker — most visa applications begin with a strong CV.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link href="/tools/ats-cv-checker">
              <Button size="lg" className="bg-white text-blue-950 hover:bg-blue-50">
                Free ATS CV Check
              </Button>
            </Link>
            <Link href="/services">
              <Button size="lg" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10">
                Career Services from KES 99
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
