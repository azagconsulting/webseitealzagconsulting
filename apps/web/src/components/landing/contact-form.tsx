"use client";

import { CheckCircle2, Loader2, SendHorizontal } from "lucide-react";
import { useState } from "react";

import { apiRequest } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface FormState {
  fullName: string;
  email: string;
  company: string;
  phone: string;
  message: string;
}

const defaultState: FormState = {
  fullName: "",
  email: "",
  company: "",
  phone: "",
  message: "",
};

export function ContactForm() {
  const [form, setForm] = useState<FormState>(defaultState);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleChange = (field: keyof FormState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
    };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setStatus("submitting");

    try {
      await apiRequest("/public/contact", {
        method: "POST",
        body: JSON.stringify({
          ...form,
        }),
      });
      setStatus("success");
      setForm(defaultState);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Etwas ist schiefgelaufen.";
      setError(message);
      setStatus("error");
    }
  };

  const disabled = status === "submitting";

  return (
    <div className="rounded-[32px] border border-white/10 bg-white/5 p-8 shadow-[0_30px_70px_rgba(8,15,40,0.35)]">
      <div className="mb-6 space-y-2">
        <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Kontakt</p>
        <h2 className="text-2xl font-semibold text-white">Direkt in die Pipeline</h2>
        <p className="text-sm text-slate-400">
          Jede Anfrage wird direkt per E-Mail zugestellt und bestätigt. Kein CRM-Eintrag.
        </p>
      </div>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs uppercase tracking-[0.3em] text-slate-400">Name</label>
            <Input
              required
              autoComplete="name"
              placeholder="Vor- & Nachname"
              value={form.fullName}
              onChange={handleChange("fullName")}
              disabled={disabled}
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.3em] text-slate-400">E-Mail</label>
            <Input
              required
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={form.email}
              onChange={handleChange("email")}
              disabled={disabled}
            />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs uppercase tracking-[0.3em] text-slate-400">Firma</label>
            <Input
              placeholder="Acme GmbH"
              value={form.company}
              onChange={handleChange("company")}
              disabled={disabled}
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.3em] text-slate-400">Telefon</label>
            <Input
              placeholder="+49 ..."
              value={form.phone}
              onChange={handleChange("phone")}
              disabled={disabled}
            />
          </div>
        </div>
        <div>
          <label className="text-xs uppercase tracking-[0.3em] text-slate-400">Nachricht</label>
          <Textarea
            rows={5}
            placeholder="Worum geht es genau?"
            value={form.message}
            onChange={handleChange("message")}
            disabled={disabled}
          />
        </div>
        <Button type="submit" disabled={disabled} className="h-full w-full">
          {status === "submitting" ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Wird gesendet
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <SendHorizontal className="h-4 w-4" /> Absenden
            </span>
          )}
        </Button>
        {error && <p className="text-sm text-rose-300">{error}</p>}
        {status === "success" && (
          <p className="flex items-center gap-2 text-sm text-emerald-300">
            <CheckCircle2 className="h-4 w-4" /> Danke! Wir melden uns in Kürze.
          </p>
        )}
      </form>
    </div>
  );
}
