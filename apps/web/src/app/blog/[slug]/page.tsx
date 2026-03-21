import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, CalendarDays, PenSquare } from "lucide-react";
import { cache } from "react";

import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/markdown";
import { ApiError, apiRequest } from "@/lib/api";
import type { BlogPost } from "@/lib/types";

const fetchPost = cache(async (slug: string) => {
  try {
    return await apiRequest<BlogPost>(`/public/blog/${slug}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return null;
    }
    throw err;
  }
});

const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value?: string | null) {
  if (!value) return "—";
  try {
    return dateFormatter.format(new Date(value));
  } catch {
    return "—";
  }
}

interface BlogPostPageProps {
  params: { slug: string };
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await fetchPost(slug);
  if (!post) {
    return {
      title: "Beitrag nicht gefunden – Arcto Blog",
    };
  }

  return {
    title: `${post.title} – Arcto Blog`,
    description: post.excerpt ?? "Arcto Labs v1 Blogartikel",
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.excerpt ?? undefined,
      publishedTime: post.publishedAt ?? undefined,
      url: `/blog/${post.slug}`,
      images: post.coverImage ? [post.coverImage] : undefined,
    },
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = await fetchPost(slug);
  if (!post) {
    notFound();
  }

  const authorName = post.author?.firstName
    ? `${post.author.firstName} ${post.author.lastName ?? ""}`.trim()
    : "Arcto Team";

  return (
    <article className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-3xl px-6 py-10 space-y-8">
        <Link
          href="/blog"
          className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Zurück zur Übersicht
        </Link>

        <header className="space-y-4">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Arcto Blog</p>
          <h1 className="text-4xl font-semibold text-white">{post.title}</h1>
          {post.excerpt && <p className="text-lg text-slate-300">{post.excerpt}</p>}
          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-400">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.3em]">
              <CalendarDays className="h-4 w-4" /> {formatDate(post.publishedAt)}
            </span>
            <span className="inline-flex items-center gap-2 text-sm">
              <PenSquare className="h-4 w-4" /> {authorName}
            </span>
          </div>
        </header>

        {post.coverImage ? (
          <div className="h-64 w-full overflow-hidden rounded-[32px] border border-white/10">
            <div
              className="h-full w-full bg-cover bg-center"
              style={{ backgroundImage: `url(${post.coverImage})` }}
            />
          </div>
        ) : (
          <div className="h-64 rounded-[32px] border border-white/10 bg-gradient-to-r from-sky-500/20 via-transparent to-fuchsia-500/20" />
        )}

        <div className="rounded-[32px] border border-white/10 bg-black/30 p-8 text-lg leading-relaxed text-slate-200">
          <Markdown>{post.content}</Markdown>
        </div>

        <section className="rounded-[32px] border border-white/10 bg-white/5 p-8 text-center">
          <h2 className="text-2xl font-semibold text-white">Bereit für mehr?</h2>
          <p className="mt-2 text-sm text-slate-400">
            Sprich mit uns über Roadmap, Automationen und alles, was nach diesem Artikel offen bleibt.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/#kontakt" className="inline-flex">
              <Button size="lg">Kontakt aufnehmen</Button>
            </Link>
            <Link href="/dashboard" className="inline-flex">
              <Button variant="secondary" size="lg">
                Dashboard ansehen
              </Button>
            </Link>
          </div>
        </section>
      </div>
    </article>
  );
}
