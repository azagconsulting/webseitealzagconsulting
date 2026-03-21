"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  FileUp,
  FolderKanban,
  House,
  ImagePlus,
  Loader2,
  LogOut,
  Mail,
  Megaphone,
  Phone,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { ChatWidget } from "@/components/chat-widget";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, authHeaders, buildApiUrl } from "@/lib/api";
import type {
  CustomerPackage,
  CustomerPortalFile,
  CustomerPortalFileListResponse,
  CustomerPortalHomeResponse,
  CustomerPortalProjectLogoUploadResponse,
  CustomerPortalProjectMediaUploadResponse,
  CustomerPortalProjectProfile,
  CustomerPortalProjectProfileResponse,
  ServiceOrderStatus,
} from "@/lib/types";

const stageLabels: Record<ServiceOrderStatus, string> = {
  PLANNED: "Geplant",
  IN_SERVICE: "In Arbeit",
  COMPLETED: "Abgeschlossen",
  CANCELLED: "Storniert",
};

const packageLabels: Record<CustomerPackage, string> = {
  STARTER: "Starter",
  GROWTH: "Growth",
  ENTERPRISE: "Enterprise",
};

const packageDescriptions: Record<CustomerPackage, string> = {
  STARTER: "Basisbetreuung und Standard-Umsetzung.",
  GROWTH: "Erweiterte Automationen und schnellere Iterationen.",
  ENTERPRISE: "Individuelle Prozesse mit priorisiertem Support.",
};

const dateTimeFormatter = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
});

const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
});

const formatBytes = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  return dateTimeFormatter.format(new Date(value));
};

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  return dateFormatter.format(new Date(value));
};

type PortalSidebarItem = "home" | "project" | "settings";

interface ProjectProfileFormState {
  name: string;
  email: string;
  phone: string;
  mobile: string;
  street: string;
  postalCode: string;
  city: string;
  preferredChannel: string;
  legalName: string;
  website: string;
  industry: string;
  companySize: string;
  primaryContactName: string;
  billingEmail: string;
  projectGoals: string;
  brandNotes: string;
  notes: string;
}

const emptyProjectProfileForm: ProjectProfileFormState = {
  name: "",
  email: "",
  phone: "",
  mobile: "",
  street: "",
  postalCode: "",
  city: "",
  preferredChannel: "",
  legalName: "",
  website: "",
  industry: "",
  companySize: "",
  primaryContactName: "",
  billingEmail: "",
  projectGoals: "",
  brandNotes: "",
  notes: "",
};

const toProjectProfileForm = (profile?: CustomerPortalProjectProfile | null): ProjectProfileFormState => ({
  name: profile?.name ?? "",
  email: profile?.email ?? "",
  phone: profile?.phone ?? "",
  mobile: profile?.mobile ?? "",
  street: profile?.street ?? "",
  postalCode: profile?.postalCode ?? "",
  city: profile?.city ?? "",
  preferredChannel: profile?.preferredChannel ?? "",
  legalName: profile?.legalName ?? "",
  website: profile?.website ?? "",
  industry: profile?.industry ?? "",
  companySize: profile?.companySize ?? "",
  primaryContactName: profile?.primaryContactName ?? "",
  billingEmail: profile?.billingEmail ?? "",
  projectGoals: profile?.projectGoals ?? "",
  brandNotes: profile?.brandNotes ?? "",
  notes: profile?.notes ?? "",
});

export default function KundenportalPage() {
  const router = useRouter();
  const { user, tokens, loading: authLoading, authorizedRequest, logout, refreshProfile } = useAuth();

  const [home, setHome] = useState<CustomerPortalHomeResponse | null>(null);
  const [files, setFiles] = useState<CustomerPortalFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [securityTab, setSecurityTab] = useState<"email" | "password">("email");
  const [emailForm, setEmailForm] = useState({
    currentPassword: "",
    newEmail: "",
    confirmEmail: "",
  });
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailNotice, setEmailNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [resetCode, setResetCode] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetNotice, setResetNotice] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [resetRequesting, setResetRequesting] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetStep, setResetStep] = useState<"idle" | "code" | "password">("idle");
  const [resetExpiresAt, setResetExpiresAt] = useState<Date | null>(null);
  const [resetCountdown, setResetCountdown] = useState(0);
  const [resetValidationLoading, setResetValidationLoading] = useState(false);
  const [resetCodeValidated, setResetCodeValidated] = useState(false);
  const [activeSidebarItem, setActiveSidebarItem] = useState<PortalSidebarItem>("home");
  const [activeNewsIndex, setActiveNewsIndex] = useState(0);
  const [projectProfile, setProjectProfile] = useState<CustomerPortalProjectProfileResponse | null>(null);
  const [projectForm, setProjectForm] = useState<ProjectProfileFormState>(emptyProjectProfileForm);
  const [projectSaving, setProjectSaving] = useState(false);
  const [projectNotice, setProjectNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoDeleting, setLogoDeleting] = useState(false);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaDeletingId, setMediaDeletingId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const resetEmail = user?.email ?? "";

  const customerName = useMemo(() => {
    return home?.customer.name ?? user?.firstName ?? user?.email ?? "Kundenbereich";
  }, [home?.customer.name, user?.email, user?.firstName]);

  const resetProgress = useMemo(() => {
    if (!resetExpiresAt || resetCountdown <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(100, (resetCountdown / (10 * 60)) * 100));
  }, [resetCountdown, resetExpiresAt]);

  const portalNews = useMemo(
    () =>
      [
        {
          id: "timeline",
          kicker: "Projekt-News",
          title: "Zeitplan im Blick behalten",
          body: home?.nextAppointment
            ? `Nächster Termin: ${formatDate(home.nextAppointment.date)} um ${home.nextAppointment.startTime} Uhr.`
            : "Aktuell ist kein Termin hinterlegt. Neue Abstimmungen sehen Sie direkt im Bereich Projekte.",
          target: "project" as PortalSidebarItem,
          actionLabel: "Zu Projekte",
        },
        {
          id: "files",
          kicker: "Dokumente",
          title: "Neue Dateien schneller teilen",
          body: "Laden Sie Briefings, Freigaben oder Anhänge direkt im Projektbereich hoch. Ihr Team sieht alles zentral.",
          target: "project" as PortalSidebarItem,
          actionLabel: "Dateien öffnen",
        },
        {
          id: "security",
          kicker: "Sicherheit",
          title: "Konto auf dem neuesten Stand halten",
          body: "Aktualisieren Sie E-Mail und Passwort regelmäßig, damit Ihr Kundenportal dauerhaft geschützt bleibt.",
          target: "settings" as PortalSidebarItem,
          actionLabel: "Einstellungen",
        },
      ] as const,
    [home?.nextAppointment],
  );

  const activeNewsSlide = portalNews[activeNewsIndex] ?? portalNews[0];

  const profileCompletion = useMemo(() => {
    const values = [
      projectForm.name,
      projectForm.email,
      projectForm.phone,
      projectForm.street,
      projectForm.postalCode,
      projectForm.city,
      projectForm.legalName,
      projectForm.website,
      projectForm.industry,
      projectForm.primaryContactName,
      projectForm.projectGoals,
      projectForm.brandNotes,
    ];
    const completed = values.filter((value) => value.trim().length > 0).length;
    const total = values.length;
    const percent = Math.round((completed / total) * 100);
    return {
      completed,
      total,
      percent,
    };
  }, [
    projectForm.brandNotes,
    projectForm.city,
    projectForm.email,
    projectForm.industry,
    projectForm.legalName,
    projectForm.name,
    projectForm.phone,
    projectForm.postalCode,
    projectForm.primaryContactName,
    projectForm.projectGoals,
    projectForm.street,
    projectForm.website,
  ]);
  const projectLogo = projectProfile?.assets.logo ?? null;
  const projectMedia = projectProfile?.assets.media ?? [];

  const fetchPortal = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [homeResponse, fileResponse, projectProfileResponse] = await Promise.all([
        authorizedRequest<CustomerPortalHomeResponse>("/customer-portal/home"),
        authorizedRequest<CustomerPortalFileListResponse>("/customer-portal/files"),
        authorizedRequest<CustomerPortalProjectProfileResponse>("/customer-portal/project-profile"),
      ]);
      setHome(homeResponse);
      setFiles(fileResponse.items ?? []);
      setProjectProfile(projectProfileResponse);
      setProjectForm(toProjectProfileForm(projectProfileResponse.profile));
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        router.replace("/login");
        return;
      }
      setError(err instanceof Error ? err.message : "Kundenportal konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [authorizedRequest, router]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.role !== "CUSTOMER") {
      router.replace("/dashboard");
      return;
    }
    void fetchPortal();
  }, [authLoading, fetchPortal, router, user]);

  useEffect(() => {
    setEmailForm((current) => ({
      ...current,
      newEmail: user?.email ?? "",
      confirmEmail: user?.email ?? "",
    }));
  }, [user?.email]);

  useEffect(() => {
    if (!resetExpiresAt) {
      setResetCountdown(0);
      return;
    }
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.floor((resetExpiresAt.getTime() - Date.now()) / 1000));
      setResetCountdown(remaining);
      if (remaining === 0) {
        setResetStep("idle");
        setResetCodeValidated(false);
        setResetNotice({
          type: "error",
          text: "Der Sicherheitscode ist abgelaufen. Bitte fordern Sie einen neuen Code an.",
        });
        setResetExpiresAt(null);
      }
    };
    updateCountdown();
    const interval = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(interval);
  }, [resetExpiresAt]);

  useEffect(() => {
    if (activeNewsIndex < portalNews.length) {
      return;
    }
    setActiveNewsIndex(0);
  }, [activeNewsIndex, portalNews.length]);

  useEffect(() => {
    if (activeSidebarItem !== "home" || portalNews.length <= 1) {
      return;
    }
    const interval = window.setInterval(() => {
      setActiveNewsIndex((current) => (current + 1) % portalNews.length);
    }, 5500);
    return () => window.clearInterval(interval);
  }, [activeSidebarItem, portalNews.length]);

  const handleNewsPrev = useCallback(() => {
    setActiveNewsIndex((current) => (current - 1 + portalNews.length) % portalNews.length);
  }, [portalNews.length]);

  const handleNewsNext = useCallback(() => {
    setActiveNewsIndex((current) => (current + 1) % portalNews.length);
  }, [portalNews.length]);

  const handleEmailChange = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setEmailSaving(true);
      setEmailNotice(null);
      try {
        const nextEmail = emailForm.newEmail.trim().toLowerCase();
        const confirmEmail = emailForm.confirmEmail.trim().toLowerCase();
        const payload = {
          currentPassword: emailForm.currentPassword.trim(),
          newEmail: nextEmail,
          confirmEmail,
        };

        const response = await authorizedRequest<{ message?: string; email?: string }>("/users/me/email", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const updatedEmail = response.email ?? nextEmail;
        setEmailForm({
          currentPassword: "",
          newEmail: updatedEmail,
          confirmEmail: updatedEmail,
        });
        setEmailNotice({ type: "success", text: response.message ?? "E-Mail wurde aktualisiert." });
        await refreshProfile();
      } catch (err) {
        setEmailNotice({
          type: "error",
          text: err instanceof Error ? err.message : "E-Mail konnte nicht geändert werden.",
        });
      } finally {
        setEmailSaving(false);
      }
    },
    [authorizedRequest, emailForm.confirmEmail, emailForm.currentPassword, emailForm.newEmail, refreshProfile],
  );

  const handleResetCodeSend = useCallback(async () => {
    if (!resetEmail.trim()) {
      setResetNotice({ type: "error", text: "Keine gültige Login-E-Mail gefunden." });
      return;
    }
    setResetRequesting(true);
    setResetNotice({ type: "info", text: "Sicherheitscode wird gesendet…" });
    try {
      const response = await authorizedRequest<{ message?: string; expiresAt?: string | null }>("/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail.trim() }),
      });
      setResetNotice({
        type: "success",
        text: response?.message ?? "Falls die Adresse existiert, wurde ein Sicherheitscode gesendet.",
      });
      setResetStep("code");
      setResetCode("");
      setResetNewPassword("");
      setResetConfirmPassword("");
      setResetCodeValidated(false);
      const nextExpiry =
        response?.expiresAt && !Number.isNaN(new Date(response.expiresAt).getTime())
          ? new Date(response.expiresAt)
          : new Date(Date.now() + 10 * 60 * 1000);
      setResetExpiresAt(nextExpiry);
    } catch (err) {
      setResetNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Sicherheitscode konnte nicht gesendet werden.",
      });
    } finally {
      setResetRequesting(false);
    }
  }, [authorizedRequest, resetEmail]);

  const handleResetCodeValidate = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!resetCode.trim() || resetCode.trim().length < 6) {
        setResetNotice({ type: "error", text: "Bitte den vollständigen Sicherheitscode eingeben." });
        return;
      }
      if (!resetEmail.trim()) {
        setResetNotice({ type: "error", text: "Keine gültige Login-E-Mail gefunden." });
        return;
      }
      setResetValidationLoading(true);
      setResetNotice({ type: "info", text: "Code wird geprüft…" });
      try {
        const response = await authorizedRequest<{ message?: string; expiresAt?: string | null }>("/auth/password-reset/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: resetEmail.trim(),
            code: resetCode.trim(),
          }),
        });
        setResetCodeValidated(true);
        setResetStep("password");
        setResetNotice({
          type: "success",
          text: response?.message ?? "Code bestätigt. Bitte neues Passwort setzen.",
        });
        if (response?.expiresAt) {
          const serverExpiry = new Date(response.expiresAt);
          if (!Number.isNaN(serverExpiry.getTime())) {
            setResetExpiresAt(serverExpiry);
          }
        }
      } catch (err) {
        setResetCodeValidated(false);
        setResetStep("code");
        setResetNotice({
          type: "error",
          text: err instanceof Error ? err.message : "Sicherheitscode ist ungültig oder abgelaufen.",
        });
      } finally {
        setResetValidationLoading(false);
      }
    },
    [authorizedRequest, resetCode, resetEmail],
  );

  const handleResetPasswordSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!resetCodeValidated || resetStep !== "password") {
        setResetNotice({ type: "error", text: "Bitte zuerst den Sicherheitscode bestätigen." });
        return;
      }
      if (resetNewPassword !== resetConfirmPassword) {
        setResetNotice({ type: "error", text: "Neues Passwort und Bestätigung stimmen nicht überein." });
        return;
      }
      setResetSubmitting(true);
      setResetNotice({ type: "info", text: "Passwort wird aktualisiert…" });
      try {
        await authorizedRequest<{ message?: string }>("/auth/password-reset/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: resetEmail.trim(),
            code: resetCode.trim(),
            newPassword: resetNewPassword.trim(),
          }),
        });
        setResetNotice({ type: "success", text: "Passwort wurde erfolgreich aktualisiert." });
        setResetCode("");
        setResetNewPassword("");
        setResetConfirmPassword("");
        setResetStep("idle");
        setResetCodeValidated(false);
        setResetExpiresAt(null);
        setResetCountdown(0);
      } catch (err) {
        setResetNotice({
          type: "error",
          text: err instanceof Error ? err.message : "Passwort konnte nicht aktualisiert werden.",
        });
      } finally {
        setResetSubmitting(false);
      }
    },
    [
      authorizedRequest,
      resetCode,
      resetCodeValidated,
      resetConfirmPassword,
      resetEmail,
      resetNewPassword,
      resetStep,
    ],
  );

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleUploadChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;

      setUploading(true);
      setError(null);
      try {
        const payload = new FormData();
        payload.append("name", file.name);
        payload.append("file", file);
        await authorizedRequest("/customer-portal/files", {
          method: "POST",
          body: payload,
        });
        await fetchPortal();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Datei konnte nicht hochgeladen werden.");
      } finally {
        setUploading(false);
      }
    },
    [authorizedRequest, fetchPortal],
  );

  const handleDownload = useCallback(
    async (file: CustomerPortalFile) => {
      if (!tokens?.accessToken) {
        setError("Bitte melden Sie sich erneut an.");
        return;
      }

      setDownloadingId(file.id);
      setError(null);
      try {
        const response = await fetch(buildApiUrl(`/customer-portal/files/${file.id}/download`), {
          method: "GET",
          headers: authHeaders(tokens.accessToken),
          cache: "no-store",
        });

        if (!response.ok) {
          const payload = await response.text();
          throw new Error(payload || "Download fehlgeschlagen.");
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = file.name;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(objectUrl);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Datei konnte nicht heruntergeladen werden.");
      } finally {
        setDownloadingId(null);
      }
    },
    [tokens?.accessToken],
  );

  const handleProjectFieldChange = useCallback((field: keyof ProjectProfileFormState, value: string) => {
    setProjectForm((current) => ({
      ...current,
      [field]: value,
    }));
  }, []);

  const handleProjectProfileSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!projectForm.name.trim()) {
        setProjectNotice({ type: "error", text: "Bitte einen Firmennamen angeben." });
        return;
      }
      setProjectSaving(true);
      setProjectNotice(null);
      setError(null);
      try {
        const response = await authorizedRequest<CustomerPortalProjectProfileResponse>("/customer-portal/project-profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: projectForm.name.trim(),
            email: projectForm.email || null,
            phone: projectForm.phone || null,
            mobile: projectForm.mobile || null,
            street: projectForm.street || null,
            postalCode: projectForm.postalCode || null,
            city: projectForm.city || null,
            preferredChannel: projectForm.preferredChannel || null,
            legalName: projectForm.legalName || null,
            website: projectForm.website || null,
            industry: projectForm.industry || null,
            companySize: projectForm.companySize || null,
            primaryContactName: projectForm.primaryContactName || null,
            billingEmail: projectForm.billingEmail || null,
            projectGoals: projectForm.projectGoals || null,
            brandNotes: projectForm.brandNotes || null,
            notes: projectForm.notes || null,
          }),
        });
        setProjectProfile(response);
        setProjectForm(toProjectProfileForm(response.profile));
        setProjectNotice({ type: "success", text: "Unternehmensdaten wurden gespeichert." });
      } catch (err) {
        setProjectNotice({
          type: "error",
          text: err instanceof Error ? err.message : "Unternehmensdaten konnten nicht gespeichert werden.",
        });
      } finally {
        setProjectSaving(false);
      }
    },
    [authorizedRequest, projectForm],
  );

  const handleLogoUploadClick = useCallback(() => {
    logoInputRef.current?.click();
  }, []);

  const handleLogoUploadChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) {
        return;
      }
      setLogoUploading(true);
      setProjectNotice(null);
      setError(null);
      try {
        const payload = new FormData();
        payload.append("file", file);
        const response = await authorizedRequest<CustomerPortalProjectLogoUploadResponse>("/customer-portal/project-logo", {
          method: "POST",
          body: payload,
        });
        setProjectProfile((current) =>
          current
            ? {
                ...current,
                assets: {
                  ...current.assets,
                  logo: response.item,
                },
              }
            : current,
        );
        setProjectNotice({ type: "success", text: "Logo wurde aktualisiert." });
      } catch (err) {
        setProjectNotice({
          type: "error",
          text: err instanceof Error ? err.message : "Logo konnte nicht hochgeladen werden.",
        });
      } finally {
        setLogoUploading(false);
      }
    },
    [authorizedRequest],
  );

  const handleLogoDelete = useCallback(async () => {
    setLogoDeleting(true);
    setProjectNotice(null);
    setError(null);
    try {
      await authorizedRequest("/customer-portal/project-logo", {
        method: "DELETE",
      });
      setProjectProfile((current) =>
        current
          ? {
              ...current,
              assets: {
                ...current.assets,
                logo: null,
              },
            }
          : current,
      );
      setProjectNotice({ type: "success", text: "Logo wurde entfernt." });
    } catch (err) {
      setProjectNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Logo konnte nicht gelöscht werden.",
      });
    } finally {
      setLogoDeleting(false);
    }
  }, [authorizedRequest]);

  const handleMediaUploadClick = useCallback(() => {
    mediaInputRef.current?.click();
  }, []);

  const handleMediaUploadChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(event.target.files ?? []);
      event.target.value = "";
      if (!selectedFiles.length) {
        return;
      }
      setMediaUploading(true);
      setProjectNotice(null);
      setError(null);
      try {
        const payload = new FormData();
        selectedFiles.forEach((file) => {
          payload.append("files", file);
        });
        const response = await authorizedRequest<CustomerPortalProjectMediaUploadResponse>("/customer-portal/project-media", {
          method: "POST",
          body: payload,
        });
        setProjectProfile((current) =>
          current
            ? {
                ...current,
                assets: {
                  ...current.assets,
                  media: [...response.items, ...current.assets.media],
                },
              }
            : current,
        );
        setProjectNotice({ type: "success", text: "Bildmaterial wurde hochgeladen." });
      } catch (err) {
        setProjectNotice({
          type: "error",
          text: err instanceof Error ? err.message : "Bildmaterial konnte nicht hochgeladen werden.",
        });
      } finally {
        setMediaUploading(false);
      }
    },
    [authorizedRequest],
  );

  const handleMediaDelete = useCallback(
    async (fileId: string) => {
      setMediaDeletingId(fileId);
      setProjectNotice(null);
      setError(null);
      try {
        await authorizedRequest(`/customer-portal/project-media/${fileId}`, {
          method: "DELETE",
        });
        setProjectProfile((current) =>
          current
            ? {
                ...current,
                assets: {
                  ...current.assets,
                  media: current.assets.media.filter((item) => item.id !== fileId),
                },
              }
            : current,
        );
      } catch (err) {
        setProjectNotice({
          type: "error",
          text: err instanceof Error ? err.message : "Datei konnte nicht gelöscht werden.",
        });
      } finally {
        setMediaDeletingId(null);
      }
    },
    [authorizedRequest],
  );

  if (authLoading || loading) {
    return (
      <main className="min-h-screen bg-slate-950 px-5 py-16 text-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-amber-300" />
        </div>
      </main>
    );
  }

  if (!user || user.role !== "CUSTOMER") {
    return null;
  }

  return (
    <>
      <main className="min-h-screen bg-[radial-gradient(circle_at_12%_10%,rgba(212,175,55,0.18),transparent_36%),radial-gradient(circle_at_88%_88%,rgba(212,175,55,0.14),transparent_42%),#050813] px-5 py-8 text-white">
        <div className="mx-auto grid w-full max-w-7xl gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
        <Card className="border border-white/10 bg-slate-950/80 p-4 xl:sticky xl:top-6 xl:h-[calc(100vh-3rem)] xl:self-start">
          <div className="flex h-full flex-col">
            <div className="pb-4">
              <div className="flex items-center justify-center px-3 py-2 text-center">
                <img
                  src="/assets/images/logo-light.png"
                  alt="Alzag Consulting"
                  width={220}
                  height={56}
                  className="h-14 w-auto object-contain"
                  loading="eager"
                  decoding="async"
                />
              </div>
            </div>

            <nav className="space-y-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setActiveSidebarItem("home")}
                className={`w-full justify-start border border-white/15 text-white hover:bg-white/10 ${
                  activeSidebarItem === "home" ? "bg-white/10" : "bg-white/5"
                }`}
              >
                <House className="mr-2 h-4 w-4" />
                Home
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setActiveSidebarItem("project")}
                className={`w-full justify-start border border-white/15 text-white hover:bg-white/10 ${
                  activeSidebarItem === "project" ? "bg-white/10" : "bg-white/5"
                }`}
              >
                <FolderKanban className="mr-2 h-4 w-4" />
                Projekt
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setActiveSidebarItem("settings")}
                className={`w-full justify-start border border-white/15 text-white hover:bg-white/10 ${
                  activeSidebarItem === "settings" ? "bg-white/10" : "bg-white/5"
                }`}
              >
                <Settings2 className="mr-2 h-4 w-4" />
                Einstellungen
              </Button>
            </nav>

            <div className="mt-auto pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={logout}
                className="w-full justify-start border border-white/15 bg-white/5 text-white hover:bg-white/10"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </Button>
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          {error ? (
            <Card className="border border-rose-400/30 bg-rose-500/10 p-4">
              <p className="text-sm text-rose-200">{error}</p>
            </Card>
          ) : null}

          {activeSidebarItem === "home" ? (
            <div className="space-y-6">
              <Card className="overflow-hidden border border-amber-400/30 bg-[radial-gradient(circle_at_8%_12%,rgba(251,191,36,0.2),transparent_45%),radial-gradient(circle_at_84%_84%,rgba(56,189,248,0.14),transparent_46%),rgba(2,6,23,0.88)] p-6 shadow-[0_24px_60px_-28px_rgba(251,191,36,0.45)]">
                <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
                  <div>
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/40 bg-amber-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-amber-200">
                      <Sparkles className="h-3.5 w-3.5" />
                      Willkommensbereich
                    </span>
                    <h1 className="mt-3 text-3xl font-semibold leading-tight text-white">
                      Willkommen zurück, {customerName}
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm text-slate-200">
                      Ihr persönlicher Bereich für Projektstatus, Dateien und sichere Kommunikation mit dem Team von
                      Alzag Consulting.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        onClick={() => setActiveSidebarItem("project")}
                        className="bg-amber-500 text-slate-950 hover:bg-amber-400"
                      >
                        <FolderKanban className="mr-2 h-4 w-4" />
                        Zu Projekte
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setActiveSidebarItem("settings")}
                        className="border border-white/15 bg-white/5 text-white hover:bg-white/10"
                      >
                        <Settings2 className="mr-2 h-4 w-4" />
                        Konto verwalten
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3">
                    <Card className="border border-white/15 bg-white/5 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Paket</p>
                      <p className="mt-2 text-lg font-semibold text-white">
                        {home ? packageLabels[home.customer.customerPackage] : "Starter"}
                      </p>
                      <p className="mt-1 text-xs text-slate-300">
                        {home ? packageDescriptions[home.customer.customerPackage] : packageDescriptions.STARTER}
                      </p>
                    </Card>
                    <Card className="border border-white/15 bg-white/5 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Nächster Termin</p>
                      {home?.nextAppointment ? (
                        <div className="mt-2 space-y-1">
                          <p className="text-sm font-medium text-white">{home.nextAppointment.title}</p>
                          <p className="text-xs text-slate-300">
                            {formatDate(home.nextAppointment.date)} · {home.nextAppointment.startTime}–
                            {home.nextAppointment.endTime}
                          </p>
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-slate-300">Noch kein Termin eingetragen.</p>
                      )}
                    </Card>
                  </div>
                </div>
              </Card>

              <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
                <Card className="border border-white/10 bg-slate-950/70 p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Megaphone className="h-4 w-4 text-amber-300" />
                      <p className="text-xs uppercase tracking-[0.24em] text-slate-400">News Slider</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 border border-white/15 bg-white/5 text-white hover:bg-white/10"
                        onClick={handleNewsPrev}
                        aria-label="Vorherige News"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 border border-white/15 bg-white/5 text-white hover:bg-white/10"
                        onClick={handleNewsNext}
                        aria-label="Nächste News"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-amber-400/25 bg-amber-500/10 p-5">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-amber-200">{activeNewsSlide.kicker}</p>
                    <p className="mt-2 text-xl font-semibold text-white">{activeNewsSlide.title}</p>
                    <p className="mt-2 text-sm text-slate-200">{activeNewsSlide.body}</p>
                    <Button
                      type="button"
                      className="mt-4 bg-amber-500 text-slate-950 hover:bg-amber-400"
                      onClick={() => setActiveSidebarItem(activeNewsSlide.target)}
                    >
                      {activeNewsSlide.actionLabel}
                    </Button>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    {portalNews.map((slide, index) => (
                      <button
                        key={slide.id}
                        type="button"
                        onClick={() => setActiveNewsIndex(index)}
                        className={`h-2.5 rounded-full transition ${
                          activeNewsIndex === index
                            ? "w-8 bg-amber-300"
                            : "w-2.5 bg-white/25 hover:bg-white/40"
                        }`}
                        aria-label={`News ${index + 1}`}
                      />
                    ))}
                  </div>
                </Card>

                <Card className="border border-white/10 bg-slate-950/70 p-6">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Schnellstart</p>
                  <h3 className="mt-3 text-lg font-semibold text-white">Was möchten Sie als Nächstes tun?</h3>
                  <div className="mt-4 space-y-2">
                    <button
                      type="button"
                      onClick={() => setActiveSidebarItem("project")}
                      className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-left text-sm text-slate-100 hover:bg-white/10"
                    >
                      Projektstatus prüfen und Dateien verwalten
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveSidebarItem("settings")}
                      className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-left text-sm text-slate-100 hover:bg-white/10"
                    >
                      Sicherheitsdaten aktualisieren
                    </button>
                  </div>
                  <div className="mt-5 rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3">
                    <p className="text-xs text-emerald-200">
                      Support-Tipp: Nutzen Sie den Chat unten rechts für schnelle Rückfragen an Ihr Projektteam.
                    </p>
                  </div>
                </Card>
              </div>

            </div>
          ) : null}

          {activeSidebarItem === "project" ? (
            <div className="space-y-6">
              <Card className="overflow-hidden border border-amber-400/30 bg-[radial-gradient(circle_at_14%_16%,rgba(251,191,36,0.2),transparent_46%),radial-gradient(circle_at_84%_82%,rgba(56,189,248,0.18),transparent_48%),rgba(2,6,23,0.9)] p-6 shadow-[0_28px_68px_-30px_rgba(251,191,36,0.5)]">
                <div className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
                  <div>
                    <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-amber-200">
                      <Building2 className="h-3.5 w-3.5" />
                      Projektraum
                    </span>
                    <h2 className="mt-3 text-3xl font-semibold leading-tight text-white">Projektprofil & Unternehmensdaten</h2>
                    <p className="mt-3 max-w-2xl text-sm text-slate-200">
                      Hinterlegen Sie hier alle Informationen, die unser Team für Umsetzung, Branding und Kommunikation
                      benötigt. Änderungen werden direkt Ihrem Projektkonto zugeordnet.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <Button type="button" onClick={handleMediaUploadClick} className="bg-amber-500 text-slate-950 hover:bg-amber-400">
                        <ImagePlus className="mr-2 h-4 w-4" />
                        Bildmaterial hochladen
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={handleUploadClick}
                        className="border border-white/15 bg-white/5 text-white hover:bg-white/10"
                      >
                        <FileUp className="mr-2 h-4 w-4" />
                        Dokument senden
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                    <Card className="border border-white/15 bg-white/5 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Profilstatus</p>
                      <p className="mt-2 text-2xl font-semibold text-white">{profileCompletion.percent}%</p>
                      <p className="text-xs text-slate-300">
                        {profileCompletion.completed} von {profileCompletion.total} Kernfeldern gepflegt
                      </p>
                    </Card>
                    <Card className="border border-white/15 bg-white/5 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Aktive Projekte</p>
                      <p className="mt-2 text-2xl font-semibold text-white">{home?.stats.openOrders ?? 0}</p>
                      <p className="text-xs text-slate-300">{projectMedia.length} Medien-Dateien im Upload-Bereich</p>
                    </Card>
                  </div>
                </div>
              </Card>

              {projectNotice ? (
                <Card
                  className={`border p-4 ${
                    projectNotice.type === "success"
                      ? "border-emerald-400/40 bg-emerald-500/10"
                      : "border-rose-400/40 bg-rose-500/10"
                  }`}
                >
                  <p className={`text-sm ${projectNotice.type === "success" ? "text-emerald-200" : "text-rose-200"}`}>
                    {projectNotice.text}
                  </p>
                </Card>
              ) : null}

              <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
                <form onSubmit={handleProjectProfileSubmit}>
                  <Card className="border border-white/10 bg-slate-950/70 p-6">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Unternehmensprofil</p>
                        <p className="mt-1 text-sm text-slate-300">
                          Stammdaten, Ansprechpartner und Projektbriefing für das Team.
                        </p>
                      </div>
                      <ClipboardList className="h-5 w-5 text-amber-300" />
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <label className="text-sm text-slate-300">
                        Firmenname
                        <Input
                          className="mt-2"
                          value={projectForm.name}
                          onChange={(event) => handleProjectFieldChange("name", event.target.value)}
                          placeholder="Muster GmbH"
                          required
                        />
                      </label>
                      <label className="text-sm text-slate-300">
                        Rechtlicher Name
                        <Input
                          className="mt-2"
                          value={projectForm.legalName}
                          onChange={(event) => handleProjectFieldChange("legalName", event.target.value)}
                          placeholder="Muster GmbH & Co. KG"
                        />
                      </label>
                      <label className="text-sm text-slate-300">
                        Kontakt E-Mail
                        <Input
                          type="email"
                          className="mt-2"
                          value={projectForm.email}
                          onChange={(event) => handleProjectFieldChange("email", event.target.value)}
                          placeholder="kontakt@beispiel.de"
                        />
                      </label>
                      <label className="text-sm text-slate-300">
                        Telefon
                        <Input
                          className="mt-2"
                          value={projectForm.phone}
                          onChange={(event) => handleProjectFieldChange("phone", event.target.value)}
                          placeholder="+49 ..."
                        />
                      </label>
                      <label className="text-sm text-slate-300">
                        Mobil
                        <Input
                          className="mt-2"
                          value={projectForm.mobile}
                          onChange={(event) => handleProjectFieldChange("mobile", event.target.value)}
                          placeholder="+49 ..."
                        />
                      </label>
                      <label className="text-sm text-slate-300">
                        Website
                        <Input
                          className="mt-2"
                          value={projectForm.website}
                          onChange={(event) => handleProjectFieldChange("website", event.target.value)}
                          placeholder="https://..."
                        />
                      </label>
                      <label className="text-sm text-slate-300">
                        Straße
                        <Input
                          className="mt-2"
                          value={projectForm.street}
                          onChange={(event) => handleProjectFieldChange("street", event.target.value)}
                          placeholder="Musterstraße 1"
                        />
                      </label>
                      <label className="text-sm text-slate-300">
                        Ansprechpartner
                        <Input
                          className="mt-2"
                          value={projectForm.primaryContactName}
                          onChange={(event) => handleProjectFieldChange("primaryContactName", event.target.value)}
                          placeholder="Max Mustermann"
                        />
                      </label>
                      <label className="text-sm text-slate-300">
                        Postleitzahl
                        <Input
                          className="mt-2"
                          value={projectForm.postalCode}
                          onChange={(event) => handleProjectFieldChange("postalCode", event.target.value)}
                          placeholder="12345"
                        />
                      </label>
                      <label className="text-sm text-slate-300">
                        Stadt
                        <Input
                          className="mt-2"
                          value={projectForm.city}
                          onChange={(event) => handleProjectFieldChange("city", event.target.value)}
                          placeholder="Berlin"
                        />
                      </label>
                      <label className="text-sm text-slate-300">
                        Branche
                        <Input
                          className="mt-2"
                          value={projectForm.industry}
                          onChange={(event) => handleProjectFieldChange("industry", event.target.value)}
                          placeholder="IT, Handwerk, E-Commerce ..."
                        />
                      </label>
                      <label className="text-sm text-slate-300">
                        Unternehmensgröße
                        <Input
                          className="mt-2"
                          value={projectForm.companySize}
                          onChange={(event) => handleProjectFieldChange("companySize", event.target.value)}
                          placeholder="z. B. 25 Mitarbeiter"
                        />
                      </label>
                      <label className="text-sm text-slate-300">
                        Abrechnungs-E-Mail
                        <Input
                          type="email"
                          className="mt-2"
                          value={projectForm.billingEmail}
                          onChange={(event) => handleProjectFieldChange("billingEmail", event.target.value)}
                          placeholder="rechnung@beispiel.de"
                        />
                      </label>
                      <label className="text-sm text-slate-300">
                        Bevorzugter Kanal
                        <Input
                          className="mt-2"
                          value={projectForm.preferredChannel}
                          onChange={(event) => handleProjectFieldChange("preferredChannel", event.target.value)}
                          placeholder="E-Mail, Telefon, Chat ..."
                        />
                      </label>
                    </div>

                    <div className="mt-5 space-y-4">
                      <label className="block text-sm text-slate-300">
                        Projektziele
                        <Textarea
                          className="mt-2 min-h-[90px]"
                          value={projectForm.projectGoals}
                          onChange={(event) => handleProjectFieldChange("projectGoals", event.target.value)}
                          placeholder="Was soll in diesem Projekt erreicht werden?"
                        />
                      </label>
                      <label className="block text-sm text-slate-300">
                        Brand- und Design-Hinweise
                        <Textarea
                          className="mt-2 min-h-[90px]"
                          value={projectForm.brandNotes}
                          onChange={(event) => handleProjectFieldChange("brandNotes", event.target.value)}
                          placeholder="Farben, Bildsprache, Tonalität, Must-haves ..."
                        />
                      </label>
                      <label className="block text-sm text-slate-300">
                        Zusätzliche Hinweise
                        <Textarea
                          className="mt-2 min-h-[90px]"
                          value={projectForm.notes}
                          onChange={(event) => handleProjectFieldChange("notes", event.target.value)}
                          placeholder="Freitext für Anforderungen, Deadlines oder interne Notizen"
                        />
                      </label>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-slate-400">
                        Das Team nutzt diese Angaben direkt für Rückfragen, Briefings und Umsetzung.
                      </p>
                      <Button type="submit" disabled={projectSaving} className="bg-amber-500 text-slate-950 hover:bg-amber-400">
                        {projectSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BadgeCheck className="mr-2 h-4 w-4" />}
                        Profil speichern
                      </Button>
                    </div>
                  </Card>
                </form>

                <div className="space-y-5">
                  <Card className="border border-white/10 bg-slate-950/70 p-6">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Projekt-Check</p>
                        <p className="mt-1 text-sm text-slate-300">Status aus Profil, Paket und Aufgaben.</p>
                      </div>
                      <Target className="h-5 w-5 text-amber-300" />
                    </div>
                    <div className="mt-4 rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4">
                      <p className="text-sm font-medium text-white">Profil-Fortschritt: {profileCompletion.percent}%</p>
                      <div className="mt-3 h-2.5 w-full rounded-full bg-white/10">
                        <div
                          className="h-2.5 rounded-full bg-amber-400 transition-all"
                          style={{ width: `${profileCompletion.percent}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-amber-100">
                        {profileCompletion.completed} von {profileCompletion.total} Pflicht-relevanten Angaben sind gepflegt.
                      </p>
                    </div>
                    <div className="mt-4 space-y-2 text-sm text-slate-200">
                      <p className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                        Paket: {home ? packageLabels[home.customer.customerPackage] : "Starter"}
                      </p>
                      <p className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                        Projekte offen: {home?.stats.openOrders ?? 0}
                      </p>
                      <p className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                        Dokumente: {home?.stats.totalFiles ?? 0} · Medien: {projectMedia.length}
                      </p>
                    </div>
                  </Card>

                  <Card className="border border-white/10 bg-slate-950/70 p-6">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Unternehmenslogo</p>
                        <p className="mt-1 text-sm text-slate-300">Wird als Projektlogo im System hinterlegt.</p>
                      </div>
                      <Building2 className="h-5 w-5 text-amber-300" />
                    </div>
                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                      {projectLogo ? (
                        <div className="space-y-1 text-sm text-slate-200">
                          <p className="font-medium text-white">{projectLogo.name}</p>
                          <p className="text-xs text-slate-400">
                            {formatBytes(projectLogo.size)} · {formatDateTime(projectLogo.createdAt)}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-300">Noch kein Logo hinterlegt.</p>
                      )}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        onClick={handleLogoUploadClick}
                        disabled={logoUploading}
                        className="bg-amber-500 text-slate-950 hover:bg-amber-400"
                      >
                        {logoUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
                        {projectLogo ? "Logo ersetzen" : "Logo hochladen"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => void handleLogoDelete()}
                        disabled={!projectLogo || logoDeleting}
                        className="border border-white/15 bg-white/5 text-white hover:bg-white/10"
                      >
                        {logoDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                        Logo löschen
                      </Button>
                      {projectLogo ? (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => void handleDownload(projectLogo)}
                          className="border border-white/15 bg-white/5 text-white hover:bg-white/10"
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Download
                        </Button>
                      ) : null}
                    </div>
                    <input ref={logoInputRef} type="file" hidden accept="image/*" onChange={handleLogoUploadChange} />
                  </Card>
                </div>
              </div>

              <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
                <Card className="border border-white/10 bg-slate-950/70 p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Bildmaterial & Assets</p>
                      <p className="mt-1 text-sm text-slate-300">
                        Laden Sie Logos, Screenshots, Referenzbilder oder Kampagnenmaterial hoch.
                      </p>
                    </div>
                    <Button
                      type="button"
                      onClick={handleMediaUploadClick}
                      disabled={mediaUploading}
                      className="bg-amber-500 text-slate-950 hover:bg-amber-400"
                    >
                      {mediaUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
                      Material hochladen
                    </Button>
                  </div>
                  <input ref={mediaInputRef} type="file" hidden multiple accept="image/*,video/*,.pdf" onChange={handleMediaUploadChange} />

                  <div className="mt-4 space-y-2">
                    {!projectMedia.length ? (
                      <p className="text-sm text-slate-300">Noch kein Bildmaterial vorhanden.</p>
                    ) : (
                      projectMedia.map((file) => (
                        <div
                          key={file.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-white">{file.name}</p>
                            <p className="text-xs text-slate-400">
                              {formatBytes(file.size)} · {formatDateTime(file.createdAt)} · {file.uploadedByName}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              className="border border-white/15 bg-white/5 text-white hover:bg-white/10"
                              onClick={() => void handleDownload(file)}
                              disabled={downloadingId === file.id}
                            >
                              {downloadingId === file.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              className="border border-white/15 bg-white/5 text-white hover:bg-white/10"
                              onClick={() => void handleMediaDelete(file.id)}
                              disabled={mediaDeletingId === file.id}
                            >
                              {mediaDeletingId === file.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </Card>

                <Card className="border border-white/10 bg-slate-950/70 p-6">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Status & Termine</p>
                    <ShieldCheck className="h-5 w-5 text-amber-300" />
                  </div>

                  <div className="mt-4 rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-amber-300" />
                      <p className="text-sm font-medium text-white">Nächster Termin</p>
                    </div>
                    {home?.nextAppointment ? (
                      <div className="mt-2 space-y-1 text-sm text-slate-200">
                        <p>{home.nextAppointment.title}</p>
                        <p>
                          {formatDate(home.nextAppointment.date)} · {home.nextAppointment.startTime}–{home.nextAppointment.endTime}
                        </p>
                        {home.nextAppointment.meetingLink ? (
                          <a
                            href={home.nextAppointment.meetingLink}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-block text-amber-300 underline decoration-amber-400/60 underline-offset-4"
                          >
                            Meeting-Link öffnen
                          </a>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-slate-300">Aktuell ist kein bevorstehender Termin hinterlegt.</p>
                    )}
                  </div>

                  <div className="mt-5 space-y-3">
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Letzte Projektstände</p>
                    {!home?.recentServiceOrders.length ? (
                      <p className="text-sm text-slate-300">Noch keine Projektstände verfügbar.</p>
                    ) : (
                      home.recentServiceOrders.slice(0, 4).map((order) => (
                        <div key={order.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-white">{order.title}</p>
                            <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-xs text-slate-100">
                              {stageLabels[order.status]}
                            </span>
                          </div>
                          <div className="mt-2 space-y-1 text-xs text-slate-300">
                            <p>Aktualisiert: {formatDateTime(order.updatedAt)}</p>
                            {order.scheduledAt ? <p>Geplant: {formatDateTime(order.scheduledAt)}</p> : null}
                            {order.advisorName ? <p>Ansprechpartner: {order.advisorName}</p> : null}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </Card>
              </div>

              <Card className="border border-white/10 bg-slate-950/70 p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Projekt-Dokumente</p>
                    <p className="mt-1 text-sm text-slate-300">Verträge, Briefings und Freigaben zentral bereitstellen.</p>
                  </div>
                  <Button
                    type="button"
                    onClick={handleUploadClick}
                    disabled={uploading}
                    className="bg-amber-500 text-slate-950 hover:bg-amber-400"
                  >
                    {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
                    Datei hochladen
                  </Button>
                </div>

                <input ref={fileInputRef} type="file" hidden onChange={handleUploadChange} />

                <div className="mt-4 space-y-2">
                  {!files.length ? (
                    <p className="text-sm text-slate-300">Noch keine Dateien vorhanden.</p>
                  ) : (
                    files.map((file) => (
                      <div key={file.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-white">{file.name}</p>
                          <p className="text-xs text-slate-400">
                            {formatBytes(file.size)} · {formatDateTime(file.createdAt)} · {file.uploadedByName}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          className="border border-white/15 bg-white/5 text-white hover:bg-white/10"
                          onClick={() => void handleDownload(file)}
                          disabled={downloadingId === file.id}
                        >
                          {downloadingId === file.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Download className="mr-2 h-4 w-4" />
                              Download
                            </>
                          )}
                        </Button>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-5 flex flex-wrap gap-6 text-sm text-slate-200">
                  {projectForm.email ? (
                    <p className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-amber-300" />
                      {projectForm.email}
                    </p>
                  ) : null}
                  {projectForm.phone ? (
                    <p className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-amber-300" />
                      {projectForm.phone}
                    </p>
                  ) : null}
                  {projectForm.city ? <p>{projectForm.city}</p> : null}
                </div>
              </Card>
            </div>
          ) : null}

          {activeSidebarItem === "settings" ? (
            <div>
            <Card className="border border-white/10 bg-slate-950/70 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Einstellungen</p>
                  <p className="mt-1 text-sm text-slate-300">Login-E-Mail und Passwort verwalten.</p>
                </div>
                <div className="flex items-center rounded-full border border-white/15 bg-white/5 p-1">
                  <button
                    type="button"
                    onClick={() => setSecurityTab("email")}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      securityTab === "email"
                        ? "bg-amber-500 text-slate-950"
                        : "text-slate-300 hover:text-white"
                    }`}
                  >
                    E-Mail ändern
                  </button>
                  <button
                    type="button"
                    onClick={() => setSecurityTab("password")}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      securityTab === "password"
                        ? "bg-amber-500 text-slate-950"
                        : "text-slate-300 hover:text-white"
                    }`}
                  >
                    Passwort ändern
                  </button>
                </div>
              </div>

              {securityTab === "email" ? (
                <form className="mt-5 space-y-4" onSubmit={handleEmailChange}>
                  <label className="block text-sm text-slate-300">
                    Neue E-Mail-Adresse
                    <Input
                      type="email"
                      autoComplete="username"
                      className="mt-2"
                      value={emailForm.newEmail}
                      onChange={(e) =>
                        setEmailForm((prev) => ({
                          ...prev,
                          newEmail: e.target.value,
                        }))
                      }
                      placeholder="name@beispiel.de"
                      required
                    />
                  </label>
                  <label className="block text-sm text-slate-300">
                    E-Mail bestätigen
                    <Input
                      type="email"
                      autoComplete="username"
                      className="mt-2"
                      value={emailForm.confirmEmail}
                      onChange={(e) =>
                        setEmailForm((prev) => ({
                          ...prev,
                          confirmEmail: e.target.value,
                        }))
                      }
                      placeholder="Wiederholen"
                      required
                    />
                  </label>
                  <label className="block text-sm text-slate-300">
                    Aktuelles Passwort
                    <Input
                      type="password"
                      autoComplete="current-password"
                      className="mt-2"
                      value={emailForm.currentPassword}
                      onChange={(e) =>
                        setEmailForm((prev) => ({
                          ...prev,
                          currentPassword: e.target.value,
                        }))
                      }
                      placeholder="••••••••"
                      required
                    />
                  </label>
                  <p className="text-xs text-slate-500">
                    Nach der Änderung wird zur Sicherheit eine Bestätigung an alte und neue Adresse gesendet.
                  </p>
                  <Button type="submit" disabled={emailSaving}>
                    {emailSaving ? "Speichert…" : "E-Mail speichern"}
                  </Button>
                  {emailNotice ? (
                    <p className={`text-xs ${emailNotice.type === "success" ? "text-emerald-300" : "text-rose-300"}`}>
                      {emailNotice.text}
                    </p>
                  ) : null}
                </form>
              ) : (
                <div className="mt-5 space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-white/5/40 p-4">
                    <p className="text-sm text-slate-200">Passwort per Sicherheitscode ändern</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Der Code wird an {resetEmail || "Ihre Login-Adresse"} gesendet und ist 10 Minuten gültig.
                    </p>
                    <div className="mt-3">
                      <Button type="button" onClick={() => void handleResetCodeSend()} disabled={resetRequesting}>
                        {resetRequesting ? "Sendet…" : "Sicherheitscode senden"}
                      </Button>
                    </div>
                  </div>

                  {resetStep === "code" ? (
                    <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5/40 p-4">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                        <div className="relative h-16 w-16">
                          <div className="absolute inset-0 rounded-full border border-white/10" />
                          <div
                            className="absolute inset-0 rounded-full"
                            style={{
                              background: `conic-gradient(#0ea5e9 ${resetProgress}%, rgba(148,163,184,0.2) ${resetProgress}% 100%)`,
                              WebkitMask: "radial-gradient(circle 60%, transparent 55%, black 56%)",
                            }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-white">
                            {Math.floor(resetCountdown / 60)}:{String(resetCountdown % 60).padStart(2, "0")}
                          </div>
                        </div>
                        <p className="text-xs text-slate-400">
                          Code eingeben und bestätigen. Gültig bis{" "}
                          {resetExpiresAt ? resetExpiresAt.toLocaleTimeString("de-DE") : "—"}.
                        </p>
                      </div>

                      <form className="space-y-3" onSubmit={handleResetCodeValidate}>
                        <label className="block text-sm text-slate-300">
                          Sicherheitscode
                          <Input
                            className="mt-2"
                            value={resetCode}
                            onChange={(e) => setResetCode(e.target.value.toUpperCase())}
                            placeholder="z. B. 123456"
                            required
                          />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <Button type="submit" disabled={resetValidationLoading}>
                            {resetValidationLoading ? "Prüft…" : "Code bestätigen"}
                          </Button>
                          <Button type="button" variant="ghost" onClick={() => void handleResetCodeSend()} disabled={resetRequesting}>
                            {resetRequesting ? "Sendet…" : "Code erneut senden"}
                          </Button>
                        </div>
                      </form>
                    </section>
                  ) : null}

                  {resetStep === "password" ? (
                    <form className="space-y-4 rounded-2xl border border-white/10 bg-white/5/40 p-4" onSubmit={handleResetPasswordSubmit}>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block text-sm text-slate-300">
                          Neues Passwort
                          <Input
                            type="password"
                            className="mt-2"
                            value={resetNewPassword}
                            onChange={(e) => setResetNewPassword(e.target.value)}
                            placeholder="Mindestens 8 Zeichen"
                            required
                          />
                        </label>
                        <label className="block text-sm text-slate-300">
                          Bestätigung
                          <Input
                            type="password"
                            className="mt-2"
                            value={resetConfirmPassword}
                            onChange={(e) => setResetConfirmPassword(e.target.value)}
                            placeholder="Erneut eingeben"
                            required
                          />
                        </label>
                      </div>
                      <Button type="submit" disabled={resetSubmitting || !resetCodeValidated}>
                        {resetSubmitting ? "Aktualisiert…" : "Passwort setzen"}
                      </Button>
                    </form>
                  ) : null}

                  {resetNotice ? (
                    <p
                      className={`text-xs ${
                        resetNotice.type === "success"
                          ? "text-emerald-300"
                          : resetNotice.type === "info"
                            ? "text-sky-300"
                            : "text-rose-300"
                      }`}
                    >
                      {resetNotice.text}
                    </p>
                  ) : null}
                </div>
              )}
            </Card>
          </div>
          ) : null}
        </div>
        </div>
      </main>
      <ChatWidget audience="customer" />
    </>
  );
}
