/**
 * /blog/:slug — renders a single blog post by slug from posts.ts.
 *
 * Uses a lightweight Markdown-to-JSX renderer (see markdown-render.tsx) —
 * no external dependency, small footprint, safe by construction (no
 * dangerouslySetInnerHTML).
 */

import { Link, useRoute } from "wouter";
import { usePageSeo } from "@/hooks/use-page-seo";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Clock, User, Calendar, Home } from "lucide-react";
import { getPostBySlug, getRelatedPosts } from "./posts";
import { renderMarkdown } from "./markdown-render";

export default function BlogPost() {
  const [, params] = useRoute("/blog/:slug");
  const slug = params?.slug || "";
  const post = getPostBySlug(slug);

  // Always call the hook (rules of hooks) even if post is missing.
  usePageSeo({
    title:       post?.metaTitle ?? "Article — WorkAbroad Hub Blog",
    description: post?.description ?? "WorkAbroad Hub Blog — practical guides for Kenyans working abroad.",
    path:        `/blog/${slug}`,
    keywords:    post?.keywords ?? [],
  });

  if (!post) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">Article not found</h1>
          <p className="text-muted-foreground">The article you're looking for doesn't exist or has moved.</p>
          <Link href="/blog">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Back to blog
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const related = getRelatedPosts(post);

  return (
    <div className="min-h-screen bg-background">
      {/* Breadcrumb + hero */}
      <section className="bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-600 text-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          <div className="flex items-center gap-2 text-sm mb-3 text-blue-100/80">
            <Link href="/"><span className="hover:text-white cursor-pointer flex items-center gap-1"><Home className="h-3.5 w-3.5" /> Home</span></Link>
            <span>/</span>
            <Link href="/blog"><span className="hover:text-white cursor-pointer">Blog</span></Link>
            <span>/</span>
            <span className="truncate">{post.title}</span>
          </div>

          <div className="text-5xl mb-3">{post.heroEmoji}</div>
          <Badge className="bg-white/10 border-white/20 text-white mb-3">{post.category}</Badge>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-4 leading-tight">
            {post.title}
          </h1>
          <div className="flex items-center gap-4 text-sm text-blue-100/80 flex-wrap">
            <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" /> {post.author}</span>
            <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {new Date(post.publishedAt).toLocaleDateString("en-KE", { month: "long", day: "numeric", year: "numeric" })}</span>
            <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {post.readMinutes} min read</span>
          </div>
        </div>
      </section>

      {/* Body */}
      <article className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="prose prose-slate dark:prose-invert max-w-none prose-headings:font-bold prose-h2:text-2xl prose-h2:mt-8 prose-h2:mb-3 prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-2 prose-p:leading-relaxed prose-a:text-blue-600 hover:prose-a:underline prose-strong:font-semibold">
          {renderMarkdown(post.body)}
        </div>

        {/* Author card */}
        <Card className="mt-10 bg-muted/30">
          <CardContent className="p-5 flex items-start gap-4">
            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
              AM
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold">About the author</div>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                {post.author} is the founder of WorkAbroad Hub, Kenya's leading platform
                for verified overseas jobs and career guidance. Based in Nairobi.
              </p>
            </div>
          </CardContent>
        </Card>
      </article>

      {/* Related posts */}
      {related.length > 0 && (
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
          <h2 className="text-xl font-bold mb-4">Related articles</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {related.map((r) => (
              <Link key={r.slug} href={`/blog/${r.slug}`}>
                <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full">
                  <CardContent className="p-4 flex gap-4">
                    <div className="text-3xl">{r.heroEmoji}</div>
                    <div className="flex-1 min-w-0">
                      <Badge variant="outline" className="text-xs mb-1">{r.category}</Badge>
                      <h3 className="font-semibold text-sm leading-tight mb-1">{r.title}</h3>
                      <p className="text-xs text-muted-foreground line-clamp-2">{r.excerpt}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* CTA footer */}
      <section className="bg-slate-900 text-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center space-y-3">
          <h2 className="text-xl sm:text-2xl font-bold">Found this useful?</h2>
          <p className="text-blue-100/80 text-sm">
            Start with a free ATS CV Check, or explore our verified overseas job portals.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link href="/tools/ats-cv-checker">
              <Button size="lg" className="bg-white text-blue-950 hover:bg-blue-50">Free ATS CV Check</Button>
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
