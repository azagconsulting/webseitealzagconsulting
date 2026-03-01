import type { Metadata } from "next";

import { LandingAuthPanel } from "@/components/landing/auth-panel";

export const metadata: Metadata = {
  title: "Arcto Panel",
  robots: {
    index: false,
    follow: false,
  },
};

export default function ArctoPanelPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-8 text-white">
      <div className="w-full max-w-lg">
        <LandingAuthPanel />
      </div>
    </div>
  );
}
