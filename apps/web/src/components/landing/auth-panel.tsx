"use client";

import { LogIn, Loader2, ShieldCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const APP_HOME_PATH = process.env.NEXT_PUBLIC_APP_HOME ?? "/dashboard";

const initialState = {
  email: "",
  password: "",
};

export function LandingAuthPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, verifyLoginCode, consumeMagicLogin, error, user } = useAuth();
  const [form, setForm] = useState(initialState);
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<"credentials" | "twoFactor">("credentials");
  const [challenge, setChallenge] = useState<{ deviceId: string; expiresAt: string } | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [magicHandled, setMagicHandled] = useState(false);

  useEffect(() => {
    const magicToken = searchParams.get("magic");
    if (!magicToken || magicHandled) {
      return;
    }

    const targetPath = APP_HOME_PATH;
    setStatus("submitting");
    void consumeMagicLogin({ token: magicToken })
      .then(() => {
        setStatus("success");
        setMagicHandled(true);
        router.push(targetPath);
        if (typeof window !== "undefined") {
          window.top?.location.assign(targetPath);
        }
      })
      .catch((err) => {
        console.error(err);
        setStatus("error");
        setMagicHandled(true);
      });
  }, [consumeMagicLogin, magicHandled, router, searchParams]);

  useEffect(() => {
    if (!user) {
      return;
    }
    const targetPath = APP_HOME_PATH;
    router.replace(targetPath);
    if (typeof window !== "undefined") {
      window.top?.location.assign(targetPath);
    }
  }, [router, user]);

  const handleChange = (field: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
    };

  const handleCodeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setCode(event.target.value);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("submitting");

    try {
      const targetPath = APP_HOME_PATH;
      const result = await login({
        email: form.email,
        password: form.password,
      });
      if (result.status === "two-factor-required") {
        setChallenge({ deviceId: result.deviceId, expiresAt: result.expiresAt });
        setPhase("twoFactor");
        setCode("");
        setStatus("idle");
        return;
      }
      setStatus("success");
      router.push(targetPath);
      if (typeof window !== "undefined") {
        window.top?.location.assign(targetPath);
      }
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  };

  const handleVerify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("submitting");

    try {
      const targetPath = APP_HOME_PATH;
      await verifyLoginCode({
        email: form.email,
        code,
        deviceId: challenge?.deviceId,
      });
      setStatus("success");
      router.push(targetPath);
      if (typeof window !== "undefined") {
        window.top?.location.assign(targetPath);
      }
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  };

  const handleResend = async () => {
    setStatus("submitting");
    try {
      const targetPath = APP_HOME_PATH;
      const result = await login({
        email: form.email,
        password: form.password,
      });
      if (result.status === "two-factor-required") {
        setChallenge({ deviceId: result.deviceId, expiresAt: result.expiresAt });
        setCode("");
        setStatus("idle");
        return;
      }
      setStatus("success");
      router.push(targetPath);
      if (typeof window !== "undefined") {
        window.top?.location.assign(targetPath);
      }
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  };

  const handleBack = () => {
    setPhase("credentials");
    setStatus("idle");
    setCode("");
    setChallenge(null);
  };

  const disabled = status === "submitting";
  const expiryLabel = challenge?.expiresAt
    ? new Date(challenge.expiresAt).toLocaleTimeString("de-DE", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div id="zugang" className="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-[0_30px_70px_rgba(8,15,40,0.4)]">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Arcto Portal</p>
        <div>
          <h2 className="text-2xl font-semibold text-white">Willkommen zurück</h2>
          <p className="mt-1 text-sm text-slate-400">
            Bitte melde dich mit deinen persönlichen Zugangsdaten an, um das Dashboard zu öffnen.
          </p>
        </div>
      </div>

      {user && (
        <p className="mt-4 rounded-2xl border border-emerald-300/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          Bereits eingeloggt als <span className="font-semibold">{user.email}</span>. Gehe direkt zum Dashboard.
        </p>
      )}

      {phase === "credentials" ? (
        <form
          className="mt-6 space-y-4"
          onSubmit={handleSubmit}
          autoComplete="off"
          data-lpignore="true"
          data-1p-ignore="true"
        >
          <div>
            <label className="text-xs uppercase tracking-[0.3em] text-slate-400">E-Mail</label>
            <Input
              required
              type="email"
              autoComplete="email"
              placeholder="vorname.nachname@firma.de"
              value={form.email}
              onChange={handleChange("email")}
              disabled={disabled}
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.3em] text-slate-400">Passwort</label>
            <Input
              required
              type="password"
              autoComplete="current-password"
              placeholder="********"
              value={form.password}
              onChange={handleChange("password")}
              disabled={disabled}
            />
          </div>
          <Button type="submit" disabled={disabled} className="w-full">
            {status === "submitting" ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Wird gesendet
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <LogIn className="h-4 w-4" />
                Login & Dashboard
              </span>
            )}
          </Button>
          {(status === "error" || error) && (
            <p className="text-center text-sm text-rose-300">{error ?? "Etwas ist schiefgelaufen."}</p>
          )}
          {status === "success" && (
            <p className="text-center text-sm text-emerald-300">Erfolgreich! Du wirst weitergeleitet.</p>
          )}
        </form>
      ) : (
        <form
          className="mt-6 space-y-4"
          onSubmit={handleVerify}
          autoComplete="off"
          data-lpignore="true"
          data-1p-ignore="true"
        >
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-sky-300" />
              Wir haben einen Sicherheitscode an {form.email} gesendet.
            </span>
            {expiryLabel && (
              <p className="mt-1 text-xs text-slate-400">Gültig bis {expiryLabel} Uhr.</p>
            )}
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.3em] text-slate-400">Sicherheitscode</label>
            <Input
              required
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={code}
              onChange={handleCodeChange}
              disabled={disabled}
              maxLength={6}
            />
          </div>
          <Button type="submit" disabled={disabled} className="w-full">
            {status === "submitting" ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Wird geprüft
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                Code bestätigen
              </span>
            )}
          </Button>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              disabled={disabled}
              onClick={handleResend}
            >
              Code erneut senden
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              disabled={disabled}
              onClick={handleBack}
            >
              Zurück
            </Button>
          </div>
          {(status === "error" || error) && (
            <p className="text-center text-sm text-rose-300">{error ?? "Etwas ist schiefgelaufen."}</p>
          )}
          {status === "success" && (
            <p className="text-center text-sm text-emerald-300">Erfolgreich! Du wirst weitergeleitet.</p>
          )}
        </form>
      )}
    </div>
  );
}
