import Link from "next/link";
import type { Metadata } from "next";
import { ArrowUpRight, CalendarDays, PenSquare } from "lucide-react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { ApiError, apiRequest } from "@/lib/api";
import type { BlogPost } from "@/lib/types";

const dateFormatter = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });

export const metadata: Metadata = {
  title: "Arcto Blog",
  description: "Updates und Stories rund um Arcto Labs v1.",
  alternates: { canonical: "/blog" },
};

async function fetchBlogPosts() {
  try {
    const response = await apiRequest<{ items: BlogPost[] }>("/public/blog?limit=12");
    return response.items;
  } catch (err) {
    if (err instanceof ApiError) {
      return [];
    }
    throw err;
  }
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  try {
    return dateFormatter.format(new Date(value));
  } catch {
    return "—";
  }
}

function BlogCard({ post }: { post: BlogPost }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group flex h-full flex-col rounded-[32px] border border-white/10 bg-white/5 p-6 transition hover:border-white/30 hover:bg-white/10"
    >
      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{formatDate(post.publishedAt)}</p>
      <h3 className="mt-3 text-2xl font-semibold text-white group-hover:text-sky-200">{post.title}</h3>
      {post.excerpt && <p className="mt-3 text-sm text-slate-300">{post.excerpt}</p>}
      <div className="mt-auto flex items-center gap-2 pt-6 text-sm font-semibold text-sky-300">
        Weiterlesen <ArrowUpRight className="h-4 w-4" />
      </div>
    </Link>
  );
}

function FeaturedCard({ post }: { post: BlogPost }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="flex h-full flex-col justify-between rounded-[40px] border border-white/10 bg-gradient-to-br from-white/10 via-transparent to-white/5 p-8 transition hover:border-white/30"
    >
      <div>
        <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Aktuell</p>
        <h2 className="mt-3 text-4xl font-semibold text-white">{post.title}</h2>
        {post.excerpt && <p className="mt-4 text-base text-slate-300">{post.excerpt}</p>}
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-slate-300">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1 text-xs uppercase tracking-[0.3em]">
          <CalendarDays className="h-4 w-4" /> {formatDate(post.publishedAt)}
        </span>
        {post.author?.firstName && (
          <span className="text-xs uppercase tracking-[0.3em] text-slate-400">
            {post.author.firstName} {post.author.lastName ?? ""}
          </span>
        )}
      </div>
      <div className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-white">
        Weiterlesen <PenSquare className="h-4 w-4" />
      </div>
    </Link>
  );
}

export default async function BlogPage() {
  const posts = await fetchBlogPosts();
  const [featured, ...rest] = posts;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-12">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Logo />
          <div className="flex flex-wrap gap-3 text-sm text-slate-300">
            <Link href="/" className="hover:text-white">
              Startseite
            </Link>
            <Link href="/dashboard" className="hover:text-white">
              Dashboard
            </Link>
            <Link href="/#kontakt" className="hover:text-white">
              Kontakt
            </Link>
          </div>
        </header>

        {featured ? (
          <>
            <section className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
              <FeaturedCard post={featured} />
              <div className="space-y-4">
                {rest.slice(0, 2).map((post) => (
                  <BlogCard key={post.id} post={post} />
                ))}
              </div>
            </section>

            {rest.length > 2 && (
              <section className="grid gap-6 md:grid-cols-2">
                {rest.slice(2).map((post) => (
                  <BlogCard key={post.id} post={post} />
                ))}
              </section>
            )}
          </>
        ) : (
          <div className="rounded-[40px] border border-white/10 bg-white/5 p-12 text-center">
            <p className="text-2xl font-semibold text-white">Noch keine Beiträge</p>
            <p className="mt-3 text-sm text-slate-400">
              Sobald im Dashboard ein Beitrag veröffentlicht wird, erscheint er hier automatisch.
            </p>
            <div className="mt-6 inline-flex">
              <Link href="/" className="inline-flex">
                <Button size="lg">Zurück zur Startseite</Button>
              </Link>
            </div>
          </div>
        )}

        <section className="rounded-[40px] border border-white/10 bg-gradient-to-br from-white/10 via-transparent to-white/5 p-10">
          <div className="flex flex-col gap-6 text-center lg:flex-row lg:items-center lg:justify-between lg:text-left">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Kontakt</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">Über den Blog hinaus Fragen?</h3>
              <p className="text-sm text-slate-400">
                Schreib uns direkt über die Kontaktsektion der Startseite – das Team antwortet innerhalb eines Werktags.
              </p>
            </div>
            <Link href="/#kontakt" className="inline-flex">
              <Button variant="secondary" size="lg">
                Nachricht senden
              </Button>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
