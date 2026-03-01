import Link from "next/link";
import { ArrowRight, CheckCircle2, Palette, ShieldCheck, Workflow } from "lucide-react";

import { LandingAuthPanel } from "@/components/landing/auth-panel";
import { ContactForm } from "@/components/landing/contact-form";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

const features = [
  {
    title: "Startseite statt Baukasten",
    description:
      "Reduzierte Landingpage mit klarer Story – perfekt, um das neue CRM ruhig aufzubauen.",
    icon: SparkLine,
  },
  {
    title: "Fast leeres Dashboard",
    description:
      "Keine Colio-Altlasten mehr. Nur die essenziellen Karten, bereit für deine nächsten Schritte.",
    icon: Workflow,
  },
  {
    title: "Einstellungen bleiben",
    description:
      "Das Design-System, Dark/Light Mode und Formularstruktur bleiben stabil im Hintergrund.",
    icon: Palette,
  },
];

const checklist = [
  "Next.js App Router + Tailwind 4",
  "Prisma Backend via NestJS API",
  "Mehrsprachigkeit startklar für DE",
  "Design Tokens + Theme Switcher",
];

function SparkLine() {
  return (
    <svg viewBox="0 0 120 48" className="h-8 w-8 text-sky-300" aria-hidden>
      <path
        d="M2 42 L25 18 L47 28 L68 12 L92 24 L118 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.25),_transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(236,72,153,0.2),_transparent_55%)]" />
      </div>
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Logo />
          <div className="flex flex-wrap gap-3">
            <Link href="/blog" className="text-sm text-slate-300 hover:text-white">
              Blog
            </Link>
            <Link href="#zugang" className="text-sm text-slate-300">
              Login & Register
            </Link>
            <Link href="#kontakt" className="inline-flex">
              <Button variant="secondary" size="sm">
                Kontakt aufnehmen
              </Button>
            </Link>
          </div>
        </header>

        <main className="mt-16 space-y-16">
          <section className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-6">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.4em] text-slate-300">
                Arcto Labs
                <ShieldCheck className="h-4 w-4" />
              </span>
              <h1 className="text-balance text-4xl font-semibold text-white sm:text-5xl">
                Eine fokussierte Startseite & ein ruhiges Dashboard für dein künftiges CRM.
              </h1>
              <p className="text-lg text-slate-300">
                Wir haben Colio vollständig entfernt. Übrig bleiben Landingpage, Settings und der Designrahmen – bereit für deine CRM-Roadmap.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="#zugang" className="inline-flex">
                  <Button size="lg">
                    Login & Dashboard <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="#kontakt" className="inline-flex">
                  <Button size="lg" variant="ghost">
                    Kontakt aufnehmen
                  </Button>
                </Link>
              </div>
            </div>
            <div className="space-y-6">
              <LandingAuthPanel />
            </div>
          </section>

          <section className="grid gap-6 md:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.title} className="rounded-3xl border border-white/5 bg-white/5 p-5">
                <div className="mb-4 inline-flex rounded-2xl bg-white/10 p-3 text-white">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold text-white">{feature.title}</h3>
                <p className="text-sm text-slate-400">{feature.description}</p>
              </div>
            ))}
          </section>

          <section
            id="kontakt"
            className="grid gap-10 rounded-[40px] border border-white/10 bg-gradient-to-br from-white/10 via-transparent to-white/5 p-8 lg:grid-cols-2"
          >
            <div className="space-y-4">
              <p className="text-xs uppercase tracking-[0.4em] text-slate-300">Kontakt</p>
              <p className="text-3xl font-semibold text-white">Formular direkt ins Dashboard</p>
              <p className="text-sm text-slate-400">
                Jede Nachricht legt automatisch einen Lead mit Priorität und Routing an. In den Einstellungen kannst du
                Auto-Responder & Weiterleitung definieren.
              </p>
              <div className="space-y-3 text-sm text-slate-400">
                <p>
                  <span className="font-semibold text-white">Telefon & Co.</span> landen weiterhin per Mail – dieses
                  Formular geht in die Pipeline.
                </p>
                <p>
                  <span className="font-semibold text-white">Dashboard Einstellungen</span> erlauben dir,
                  Auto-Zuweisung & Benachrichtigungen zu steuern.
                </p>
              </div>
            </div>
            <ContactForm />
          </section>

          <section className="rounded-[40px] border border-white/10 bg-gradient-to-br from-white/10 via-transparent to-white/5 p-8">
            <div className="flex flex-col gap-6 text-center sm:text-left lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-slate-300">Roadmap</p>
                <p className="text-2xl font-semibold text-white">CRM-Funktionen folgen Schritt für Schritt</p>
                <p className="text-sm text-slate-400">
                  Starte mit einer sauberen Basis: Prisma-Datenmodell + Settings bestehen, alles andere ist leergezogen.
                </p>
              </div>
              <Link href="#zugang" className="inline-flex">
                <Button size="lg" variant="secondary">
                  Zugang sichern
                </Button>
              </Link>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
