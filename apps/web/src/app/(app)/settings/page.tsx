"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { useSearchParams } from "next/navigation";
import { Loader2, Upload } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { ThemeToggle } from "@/components/theme-toggle";
import { useDriveFileUrl } from "@/hooks/use-drive-file-url";
import { SERPAPI_KEY_STORAGE, WORKSPACE_NAME_STORAGE } from "@/lib/constants";
import { buildApiUrl } from "@/lib/api";
import type {
  ApiSettings,
  ImapEncryption,
  ImapSettings,
  SmtpEncryption,
  SmtpSettings,
  ContactSmtpSettings,
  WorkspaceSettings,
  AuthUser,
  MessageAnalysisSettings,
  OpenAiSettings,
  DriveFile,
} from "@/lib/types";

type SettingsTab =
  | "profile"
  | "workspace"
  | "ai"
  | "email"
  | "security"
  | "contact"
  | "notifications";

type ProfileForm = {
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  headline: string;
  phone: string;
  location: string;
  pronouns: string;
  bio: string;
  avatarUrl: string;
};

const notificationOptions = [
  { label: "Wichtige Aktivitäten", description: "Deals, die in den roten Bereich laufen" },
  { label: "Team-Updates", description: "Statusmeldungen aus Workspaces" },
  { label: "Designänderungen", description: "Änderungen am Dark/Light Theme" },
];

const trackingModeOptions: Array<{
  value: "LOCAL" | "GA";
  title: string;
  description: string;
}> = [
  {
    value: "LOCAL",
    title: "Eigenes Tracking",
    description: "Pageviews, Klicks & Verweildauer laufen über Arcto Analytics.",
  },
  {
    value: "GA",
    title: "Google Analytics",
    description: "Embed + Service-Account / Token anbinden.",
  },
];

const defaultProfileForm: ProfileForm = {
  firstName: "",
  lastName: "",
  email: "",
  jobTitle: "",
  headline: "",
  phone: "",
  location: "",
  pronouns: "",
  bio: "",
  avatarUrl: "",
};

const defaultWorkspaceForm: WorkspaceSettings = {
  companyName: null,
  legalName: null,
  industry: null,
  tagline: null,
  mission: null,
  vision: null,
  description: null,
  foundedYear: null,
  teamSize: null,
  supportEmail: null,
  supportPhone: null,
  timezone: "Europe/Berlin",
  currency: "EUR",
  vatNumber: null,
  registerNumber: null,
  website: null,
  address: {
    street: null,
    postalCode: null,
    city: null,
    country: null,
  },
  branding: {
    primaryColor: "#0ea5e9",
    secondaryColor: "#0f172a",
    accentColor: "#f97316",
    logoFileId: null,
  },
  updatedAt: undefined,
};

export default function SettingsPage() {
  const { user, authorizedRequest, refreshProfile } = useAuth();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [status, setStatus] = useState<string | null>(null);

  const [profileForm, setProfileForm] = useState<ProfileForm>(defaultProfileForm);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarUploadError, setAvatarUploadError] = useState<string | null>(null);

  const [workspaceForm, setWorkspaceForm] = useState<WorkspaceSettings>(defaultWorkspaceForm);
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceSaving, setWorkspaceSaving] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);

  const [openAiKey, setOpenAiKey] = useState("");
  const [serpApiKey, setSerpApiKey] = useState("");
  const [openAiStatus, setOpenAiStatus] = useState<string | null>(null);
  const [serpStatus, setSerpStatus] = useState<string | null>(null);
  const [openAiSettings, setOpenAiSettings] = useState<OpenAiSettings | null>(null);
  const [apiSettings, setApiSettings] = useState<ApiSettings>({
    embedUrl: "",
    apiToken: null,
    hasServiceAccount: false,
    trackingMode: "LOCAL",
    updatedAt: "",
    serviceAccountJson: "",
  });
  const [apiStatus, setApiStatus] = useState<string | null>(null);
  const [apiSaving, setApiSaving] = useState(false);

  const [smtpForm, setSmtpForm] = useState<SmtpSettings>({
    host: "",
    port: 587,
    username: "",
    fromName: "",
    fromEmail: "",
    encryption: "tls",
    hasPassword: false,
    updatedAt: "",
    verifiedAt: null,
  });
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpNotice, setSmtpNotice] = useState<string | null>(null);
  const [smtpSaving, setSmtpSaving] = useState(false);

  const [imapForm, setImapForm] = useState<ImapSettings>({
    host: "",
    port: 993,
    username: "",
    mailbox: "INBOX",
    spamMailbox: "Spam",
    encryption: "ssl",
    hasPassword: false,
    sinceDays: 7,
    updatedAt: "",
    verifiedAt: null,
  });
  const [imapPassword, setImapPassword] = useState("");
  const [imapNotice, setImapNotice] = useState<string | null>(null);
  const [imapSaving, setImapSaving] = useState(false);
  const [apiLoading, setApiLoading] = useState(false);
  const [contactSmtpForm, setContactSmtpForm] = useState<ContactSmtpSettings | null>(null);
  const [contactSmtpPassword, setContactSmtpPassword] = useState("");
  const [contactSmtpNotice, setContactSmtpNotice] = useState<string | null>(null);
  const [contactSmtpSaving, setContactSmtpSaving] = useState(false);
  const [analysisSettings, setAnalysisSettings] = useState<MessageAnalysisSettings>({ enabled: false });
  const [analysisSaving, setAnalysisSaving] = useState(false);
  const [analysisNotice, setAnalysisNotice] = useState<string | null>(null);
  const [emailForm, setEmailForm] = useState({ currentPassword: "", newEmail: "", confirmEmail: "" });
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailNotice, setEmailNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [resetCode, setResetCode] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const resetEmail = user?.email ?? "";
  const [resetNotice, setResetNotice] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [resetRequesting, setResetRequesting] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetStep, setResetStep] = useState<"idle" | "code" | "password">("idle");
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetExpiresAt, setResetExpiresAt] = useState<Date | null>(null);
  const [resetCountdown, setResetCountdown] = useState(0);
  const [resetValidationLoading, setResetValidationLoading] = useState(false);
  const [resetCodeValidated, setResetCodeValidated] = useState(false);

  const profileInitials = useMemo(() => {
    const initials = `${profileForm.firstName?.[0] ?? ""}${profileForm.lastName?.[0] ?? ""}`.trim();
    return initials || profileForm.email?.[0]?.toUpperCase() || "A";
  }, [profileForm.email, profileForm.firstName, profileForm.lastName]);
  const isGaMode = apiSettings.trackingMode === "GA";
  const logoDownloadUrl = useMemo(() => {
    const id = workspaceForm.branding?.logoFileId;
    return id ? buildApiUrl(`/drive/files/${id}/download`) : null;
  }, [workspaceForm.branding?.logoFileId]);
  const resetProgress = useMemo(() => {
    if (!resetExpiresAt || resetCountdown <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(100, (resetCountdown / (10 * 60)) * 100));
  }, [resetCountdown, resetExpiresAt]);
  const avatarDriveId = useMemo(
    () => (profileForm.avatarUrl?.startsWith("drive:") ? profileForm.avatarUrl.replace("drive:", "") : null),
    [profileForm.avatarUrl],
  );
  const { url: avatarDriveUrl, loading: avatarPreviewLoading } = useDriveFileUrl(avatarDriveId);
  const avatarPreviewUrl = avatarDriveId ? avatarDriveUrl : profileForm.avatarUrl || null;

  useEffect(() => {
    if (user) {
      setProfileForm((current) => ({
        ...current,
        firstName: user.firstName ?? "",
        lastName: user.lastName ?? "",
        email: user.email ?? "",
        jobTitle: (user as AuthUser).jobTitle ?? "",
        headline: user.headline ?? "",
        phone: user.phone ?? "",
        location: user.location ?? "",
        pronouns: user.pronouns ?? "",
        bio: user.bio ?? "",
        avatarUrl: user.avatarUrl ?? "",
      }));
    }
  }, [user]);

  useEffect(() => {
    setEmailForm((current) => ({
      ...current,
      newEmail: user?.email ?? "",
      confirmEmail: user?.email ?? "",
    }));
  }, [user?.email]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const storedSerp = window.localStorage.getItem(SERPAPI_KEY_STORAGE) ?? "";
    setSerpApiKey(storedSerp);
  }, []);

  useEffect(() => {
    const tab = searchParams?.get("tab");
    if (tab && ["profile", "workspace", "ai", "email", "security", "contact", "notifications"].includes(tab)) {
      setActiveTab(tab as SettingsTab);
    }
  }, [searchParams]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setWorkspaceLoading(true);
    authorizedRequest<WorkspaceSettings | null>("/settings/workspace", { signal: controller.signal })
      .then((data) => {
        if (!active) return;
        if (!data) {
          setWorkspaceForm(defaultWorkspaceForm);
          return;
        }
        setWorkspaceForm(data);
      })
      .catch(() => undefined)
      .finally(() => active && setWorkspaceLoading(false));
    return () => {
      active = false;
      controller.abort();
    };
  }, [authorizedRequest]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    authorizedRequest<SmtpSettings | null>("/settings/smtp", { signal: controller.signal })
      .then((data) => {
        if (!mounted || !data) return;
        setSmtpForm(data);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [authorizedRequest]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    authorizedRequest<ContactSmtpSettings | null>("/settings/contact-smtp", { signal: controller.signal })
      .then((data) => {
        if (!mounted) return;
        setContactSmtpForm(data);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [authorizedRequest]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    setApiLoading(true);
    authorizedRequest<ApiSettings | null>("/settings/api", { signal: controller.signal })
      .then((data) => {
        if (!mounted) return;
        if (data) {
          setApiSettings({
            ...data,
            trackingMode: data.trackingMode ?? "LOCAL",
          });
        }
      })
      .catch(() => undefined)
      .finally(() => mounted && setApiLoading(false));
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [authorizedRequest]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    authorizedRequest<ImapSettings | null>("/settings/imap", { signal: controller.signal })
      .then((data) => {
        if (!mounted || !data) return;
        setImapForm({
          ...data,
          spamMailbox: data.spamMailbox ?? "Spam",
        });
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [authorizedRequest]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    authorizedRequest<MessageAnalysisSettings>("/settings/analysis", { signal: controller.signal })
      .then((data) => {
        if (!mounted || !data) return;
        setAnalysisSettings({
          enabled: Boolean(data.enabled),
          updatedAt: data.updatedAt,
        });
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [authorizedRequest]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    authorizedRequest<OpenAiSettings | null>("/settings/openai", { signal: controller.signal })
      .then((data) => {
        if (!mounted) return;
        setOpenAiSettings(data);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [authorizedRequest]);

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
          text: "Reset-Code ist abgelaufen. Bitte erneut anfordern.",
        });
        setResetExpiresAt(null);
      }
    };
    updateCountdown();
    const interval = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(interval);
  }, [resetExpiresAt]);

  const handleProfileSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileSaving(true);
    setProfileNotice(null);
    try {
      const payload = {
        ...profileForm,
        avatarUrl: profileForm.avatarUrl?.trim() ? profileForm.avatarUrl.trim() : null,
      };
      await authorizedRequest<AuthUser>("/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setProfileNotice("Profil gespeichert.");
      await refreshProfile();
    } catch (err) {
      setProfileNotice(err instanceof Error ? err.message : "Profil konnte nicht gespeichert werden.");
    } finally {
      setProfileSaving(false);
    }
  };
  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setAvatarUploading(true);
    setAvatarUploadError(null);
    try {
      const formData = new FormData();
      formData.set("scope", "USER");
      formData.append("file", file);
      const uploaded = await authorizedRequest<DriveFile>("/drive/files", {
        method: "POST",
        body: formData,
      });
      setProfileForm((current) => ({
        ...current,
        avatarUrl: `drive:${uploaded.id}`,
      }));
    } catch (err) {
      setAvatarUploadError(err instanceof Error ? err.message : "Profilbild konnte nicht hochgeladen werden.");
    } finally {
      setAvatarUploading(false);
      if (event.target) {
        event.target.value = "";
      }
    }
  };

  const handleAvatarRemove = () => {
    setProfileForm((current) => ({
      ...current,
      avatarUrl: "",
    }));
  };

  const handleWorkspaceSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setWorkspaceSaving(true);
    setWorkspaceNotice(null);
    try {
      const trimmed = (value?: string | null) => value?.trim() || undefined;
      const payload = {
        companyName: trimmed(workspaceForm.companyName),
        legalName: trimmed(workspaceForm.legalName),
        industry: trimmed(workspaceForm.industry),
        tagline: trimmed(workspaceForm.tagline),
        mission: trimmed(workspaceForm.mission),
        vision: trimmed(workspaceForm.vision),
        description: trimmed(workspaceForm.description),
        foundedYear: workspaceForm.foundedYear ? Number(workspaceForm.foundedYear) : undefined,
        teamSize: workspaceForm.teamSize ? Number(workspaceForm.teamSize) : undefined,
        supportEmail: trimmed(workspaceForm.supportEmail),
        supportPhone: trimmed(workspaceForm.supportPhone),
        timezone: trimmed(workspaceForm.timezone),
        currency: trimmed(workspaceForm.currency),
        vatNumber: trimmed(workspaceForm.vatNumber),
        registerNumber: trimmed(workspaceForm.registerNumber),
        street: trimmed(workspaceForm.address?.street),
        postalCode: trimmed(workspaceForm.address?.postalCode),
        city: trimmed(workspaceForm.address?.city),
        country: trimmed(workspaceForm.address?.country),
        primaryColor: trimmed(workspaceForm.branding?.primaryColor),
        secondaryColor: trimmed(workspaceForm.branding?.secondaryColor),
        accentColor: trimmed(workspaceForm.branding?.accentColor),
        logoFileId: workspaceForm.branding?.logoFileId ?? null,
        website: trimmed(workspaceForm.website),
      };
      const response = await authorizedRequest<WorkspaceSettings>("/settings/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setWorkspaceForm(response);
      setWorkspaceNotice("Unternehmensprofil gespeichert.");

      if (typeof window !== "undefined") {
        const name = response.companyName?.trim() || response.legalName?.trim() || null;
        if (name) {
          window.localStorage.setItem(WORKSPACE_NAME_STORAGE, name);
        } else {
          window.localStorage.removeItem(WORKSPACE_NAME_STORAGE);
        }
        window.dispatchEvent(
          new CustomEvent("workspace-settings-updated", {
            detail: { companyName: response.companyName, legalName: response.legalName },
          }),
        );
      }
    } catch (err) {
      setWorkspaceNotice(err instanceof Error ? err.message : "Unternehmensprofil konnte nicht gespeichert werden.");
    } finally {
      setWorkspaceSaving(false);
    }
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setLogoUploading(true);
    setLogoUploadError(null);
    try {
      const formData = new FormData();
      formData.set("scope", "TEAM");
      formData.append("file", file);
      const uploaded = await authorizedRequest<DriveFile>("/drive/files", {
        method: "POST",
        body: formData,
      });
      setWorkspaceForm((current) => ({
        ...current,
        branding: {
          ...(current.branding ?? {}),
          logoFileId: uploaded.id,
        },
      }));
    } catch (err) {
      setLogoUploadError(err instanceof Error ? err.message : "Logo konnte nicht hochgeladen werden.");
    } finally {
      setLogoUploading(false);
      if (event.target) {
        event.target.value = "";
      }
    }
  };

  const handleLogoRemove = () => {
    setWorkspaceForm((current) => ({
      ...current,
      branding: {
        ...(current.branding ?? {}),
        logoFileId: null,
      },
    }));
  };

  const handleOpenAiSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setOpenAiStatus(null);
    try {
      const response = await authorizedRequest<OpenAiSettings>("/settings/openai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: openAiKey.trim() || null }),
      });
      setOpenAiSettings(response);
      setOpenAiKey("");
      setOpenAiStatus("Server-Key gespeichert.");
    } catch (err) {
      setOpenAiStatus(err instanceof Error ? err.message : "Key konnte nicht gespeichert werden.");
    }
  };

  const handleOpenAiRemove = async () => {
    setOpenAiStatus(null);
    try {
      const response = await authorizedRequest<OpenAiSettings>("/settings/openai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: null }),
      });
      setOpenAiSettings(response);
      setOpenAiKey("");
      setOpenAiStatus("Server-Key entfernt.");
    } catch (err) {
      setOpenAiStatus(err instanceof Error ? err.message : "Key konnte nicht entfernt werden.");
    }
  };

  const handleSerpSave = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SERPAPI_KEY_STORAGE, serpApiKey.trim());
    setSerpStatus("SerpAPI-Key gespeichert.");
  };

  const handleSmtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSmtpSaving(true);
    setSmtpNotice("Prüfe SMTP Zugang...");
    try {
      const payload = {
        ...smtpForm,
        port: Number(smtpForm.port),
        password: smtpPassword || undefined,
      };
      const response = await authorizedRequest<SmtpSettings>("/settings/smtp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSmtpForm(response);
      setSmtpPassword("");
      setSmtpNotice("SMTP gespeichert. Login verifiziert.");
    } catch (err) {
      setSmtpNotice(err instanceof Error ? err.message : "SMTP konnte nicht gespeichert werden.");
    } finally {
      setSmtpSaving(false);
    }
  };

  const handleApiSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setApiSaving(true);
    setApiStatus(null);
    try {
      const payload = {
        embedUrl: apiSettings.embedUrl?.trim() || null,
        apiToken: apiSettings.apiToken?.trim() || undefined,
        serviceAccountJson: apiSettings.serviceAccountJson?.trim() || undefined,
        trackingMode: apiSettings.trackingMode ?? "LOCAL",
      };
      const response = await authorizedRequest<ApiSettings>("/settings/api", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setApiSettings({
        ...response,
        serviceAccountJson: "",
        hasServiceAccount: response.hasServiceAccount || Boolean(apiSettings.serviceAccountJson),
        trackingMode: response.trackingMode ?? "LOCAL",
      });
      setApiStatus("API/Embed gespeichert.");
    } catch (err) {
      setApiStatus(err instanceof Error ? err.message : "API-Einstellungen konnten nicht gespeichert werden.");
    } finally {
      setApiSaving(false);
    }
  };

  const handleImapSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setImapSaving(true);
    setImapNotice(null);
    try {
    const payload = {
      ...imapForm,
      verifiedAt: undefined,
      port: Number(imapForm.port),
      password: imapPassword || undefined,
      sinceDays: Number(imapForm.sinceDays),
    };
      const response = await authorizedRequest<ImapSettings>("/settings/imap", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setImapForm(response);
      setImapPassword("");
      setImapNotice(
        response.verifiedAt
          ? "IMAP gespeichert. Zugriff verifiziert."
          : "IMAP gespeichert.",
      );
    } catch (err) {
      setImapNotice(err instanceof Error ? err.message : "IMAP konnte nicht gespeichert werden.");
    } finally {
      setImapSaving(false);
    }
  };

  const handleContactSmtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setContactSmtpSaving(true);
    setContactSmtpNotice("Prüfe SMTP Zugang...");
    try {
      if (!contactSmtpForm) {
        throw new Error("Bitte zuerst Daten eingeben.");
      }
      const parsedPort = Number(contactSmtpForm.port);
      if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
        throw new Error("Bitte einen gültigen Port zwischen 1 und 65535 eingeben.");
      }
      const payload = {
        host: contactSmtpForm.host,
        port: parsedPort,
        username: contactSmtpForm.username,
        fromName: contactSmtpForm.fromName,
        fromEmail: contactSmtpForm.fromEmail,
        encryption: contactSmtpForm.encryption,
        password: contactSmtpPassword || undefined,
      };
      const response = await authorizedRequest<ContactSmtpSettings>("/settings/contact-smtp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setContactSmtpForm(response);
      setContactSmtpPassword("");
      setContactSmtpNotice("Kontakt SMTP gespeichert. Login verifiziert.");
    } catch (err) {
      setContactSmtpNotice(err instanceof Error ? err.message : "Kontaktformular SMTP konnte nicht gespeichert werden.");
    } finally {
      setContactSmtpSaving(false);
    }
  };
  const handleEmailChange = async (event: React.FormEvent<HTMLFormElement>) => {
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
      setEmailForm({ currentPassword: "", newEmail: updatedEmail, confirmEmail: updatedEmail });
      setEmailNotice({ type: "success", text: response.message ?? "E-Mail aktualisiert." });
      await refreshProfile();
    } catch (err) {
      setEmailNotice({
        type: "error",
        text: err instanceof Error ? err.message : "E-Mail konnte nicht geändert werden.",
      });
    } finally {
      setEmailSaving(false);
    }
  };


  const handleOpenResetConfirm = () => {
    setResetNotice(null);
    setResetConfirmOpen(true);
  };

  const handleConfirmResetStart = async () => {
    setResetConfirmOpen(false);
    await handleResetCodeSend();
  };

  const handleResetCodeSend = async () => {
    if (!resetEmail.trim()) {
      setResetNotice({ type: "error", text: "Bitte eine gültige E-Mail angeben." });
      return;
    }
    setResetRequesting(true);
    setResetNotice({ type: "info", text: "Sende Reset-Code…" });
    try {
      const response = await authorizedRequest<{ message?: string; expiresAt?: string | null }>("/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail.trim() }),
      });
      setResetNotice({
        type: "success",
        text: response?.message ?? "Falls die Adresse existiert, wurde ein Reset-Code per E-Mail verschickt.",
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
        text: err instanceof Error ? err.message : "Reset-Code konnte nicht gesendet werden.",
      });
    } finally {
      setResetRequesting(false);
    }
  };

  const handleResetCodeValidate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resetCode.trim() || resetCode.trim().length < 6) {
      setResetNotice({
        type: "error",
        text: "Bitte gib den vollständigen Reset-Code ein.",
      });
      return;
    }
    if (!resetEmail.trim()) {
      setResetNotice({ type: "error", text: "E-Mail-Adresse fehlt." });
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
        text: response?.message ?? "Code akzeptiert. Bitte neues Passwort setzen.",
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
        text: err instanceof Error ? err.message : "Reset-Code konnte nicht bestätigt werden.",
      });
    } finally {
      setResetValidationLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resetCodeValidated || resetStep !== "password") {
      setResetNotice({
        type: "error",
        text: "Bitte zuerst den Reset-Code bestätigen.",
      });
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setResetNotice({ type: "error", text: "Neues Passwort und Bestätigung stimmen nicht überein." });
      return;
    }
    setResetSubmitting(true);
    setResetNotice({ type: "info", text: "Bestätige Reset-Code…" });
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
      setResetNotice({ type: "success", text: "Passwort über Reset-Code aktualisiert." });
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
        text: err instanceof Error ? err.message : "Reset-Code konnte nicht bestätigt werden.",
      });
    } finally {
      setResetSubmitting(false);
    }
  };

  const handleAnalysisSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAnalysisSaving(true);
    setAnalysisNotice(null);
    try {
      const payload = { enabled: Boolean(analysisSettings.enabled) };
      const response = await authorizedRequest<MessageAnalysisSettings>("/settings/analysis", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setAnalysisSettings(response);
      setAnalysisNotice(response.enabled ? "Analyse aktiviert." : "Analyse deaktiviert.");
    } catch (err) {
      setAnalysisNotice(err instanceof Error ? err.message : "Analyse-Einstellung konnte nicht gespeichert werden.");
    } finally {
      setAnalysisSaving(false);
    }
  };

  return (
    <>
      <section className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Workspace</p>
        <h1 className="text-3xl font-semibold text-white">Einstellungen</h1>
        <p className="text-sm text-slate-400">Pflege Profil, Unternehmensdaten, AI Keys und E-Mail Setup an einem Ort.</p>
      </div>
      {status && <p className="text-xs text-slate-500">{status}</p>}

      <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-white/10 bg-white/5 p-2">
        <div className="flex flex-wrap gap-2">
          {[
            { key: "profile", label: "Profil" },
            { key: "workspace", label: "Unternehmensprofil" },
            { key: "ai", label: "AI & Search Keys" },
            { key: "email", label: "E-Mail Einstellungen" },
            { key: "security", label: "Passwort & Sicherheit" },
            { key: "contact", label: "Kontaktformular" },
            { key: "notifications", label: "Benachrichtigungen" },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as SettingsTab)}
              className={clsx(
                "rounded-2xl px-4 py-2 text-sm transition",
                activeTab === tab.key ? "bg-white/20 text-white" : "text-slate-300 hover:bg-white/10",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>

      {activeTab === "profile" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Profil" description="Basisinformationen für Signaturen und Automationen.">
            <form className="space-y-4" onSubmit={handleProfileSubmit}>
              <div className="flex flex-col gap-3 rounded-3xl border border-white/5 bg-white/5/40 p-4 sm:flex-row sm:items-center">
                <div className="h-20 w-20 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                  {avatarPreviewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarPreviewUrl} alt="Profilbild" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-white/70">
                      {profileInitials}
                    </div>
                  )}
                </div>
                <div className="flex-1 text-sm text-slate-300">
                  <p className="font-semibold text-white">Profilbild</p>
                  <p className="text-xs text-slate-400">
                    PNG oder JPG bis 10 MB. Die Datei wird automatisch im persönlichen Drive gespeichert.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleAvatarUpload} />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="cursor-pointer rounded-full"
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={avatarUploading}
                    >
                      {avatarUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      {avatarUploading ? "Lädt…" : "Bild hochladen"}
                    </Button>
                    {profileForm.avatarUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="cursor-pointer"
                        onClick={handleAvatarRemove}
                      >
                        Entfernen
                      </Button>
                    )}
                  </div>
                  {avatarPreviewLoading && <p className="mt-1 text-xs text-slate-400">Vorschau wird aktualisiert…</p>}
                  {avatarUploadError && <p className="mt-1 text-xs text-rose-300">{avatarUploadError}</p>}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm text-slate-300">
                  Vorname
                  <Input className="mt-2" value={profileForm.firstName} onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })} placeholder="Mara" />
                </label>
                <label className="block text-sm text-slate-300">
                  Nachname
                  <Input className="mt-2" value={profileForm.lastName} onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })} placeholder="Schneider" />
                </label>
              </div>
              <label className="block text-sm text-slate-300">
                Jobtitel
                <Input className="mt-2" value={profileForm.jobTitle} onChange={(e) => setProfileForm({ ...profileForm, jobTitle: e.target.value })} placeholder="Customer Success Lead" />
              </label>
              <label className="block text-sm text-slate-300">
                Headline
                <Input className="mt-2" value={profileForm.headline} onChange={(e) => setProfileForm({ ...profileForm, headline: e.target.value })} placeholder="Hilft Teams, Forecasts zu gewinnen" />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm text-slate-300">
                  E-Mail
                  <Input type="email" className="mt-2" value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} placeholder="mara@arcto.app" />
                </label>
                <label className="block text-sm text-slate-300">
                  Telefonnummer
                  <Input className="mt-2" value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} placeholder="+49 30 123456" />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm text-slate-300">
                  Standort
                  <Input className="mt-2" value={profileForm.location} onChange={(e) => setProfileForm({ ...profileForm, location: e.target.value })} placeholder="Berlin, Deutschland" />
                </label>
                <label className="block text-sm text-slate-300">
                  Pronomen
                  <Input className="mt-2" value={profileForm.pronouns} onChange={(e) => setProfileForm({ ...profileForm, pronouns: e.target.value })} placeholder="sie/ihr" />
                </label>
              </div>
              <label className="block text-sm text-slate-300">
                Kurzprofil
                <Textarea rows={3} className="mt-2" value={profileForm.bio} onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })} placeholder="Was macht dich aus?" />
              </label>
              <Button size="sm" type="submit" disabled={profileSaving}>
                {profileSaving ? "Speichern…" : "Profil speichern"}
              </Button>
              {profileNotice && <p className="text-xs text-emerald-300">{profileNotice}</p>}
            </form>
          </Card>
        </div>
      )}

      {activeTab === "workspace" && (
        <Card title="Unternehmensprofil & Branding" description="Corporate Identity und Kontaktpunkte an einem Ort.">
          <form className="space-y-6" onSubmit={handleWorkspaceSubmit}>
            <div className="grid gap-6 lg:grid-cols-[1.5fr,1fr]">
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm text-slate-300">
                    Unternehmensname
                    <Input className="mt-2" value={workspaceForm.companyName ?? ""} onChange={(e) => setWorkspaceForm({ ...workspaceForm, companyName: e.target.value })} />
                  </label>
                  <label className="block text-sm text-slate-300">
                    Rechtlicher Name
                    <Input className="mt-2" value={workspaceForm.legalName ?? ""} onChange={(e) => setWorkspaceForm({ ...workspaceForm, legalName: e.target.value })} />
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm text-slate-300">
                    Branche
                    <Input className="mt-2" value={workspaceForm.industry ?? ""} onChange={(e) => setWorkspaceForm({ ...workspaceForm, industry: e.target.value })} />
                  </label>
                  <label className="block text-sm text-slate-300">
                    Teamgröße
                    <Input className="mt-2" value={workspaceForm.teamSize ?? ""} onChange={(e) => setWorkspaceForm({ ...workspaceForm, teamSize: e.target.value as unknown as number })} />
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm text-slate-300">
                    Straße
                    <Input className="mt-2" value={workspaceForm.address?.street ?? ""} onChange={(e) => setWorkspaceForm({ ...workspaceForm, address: { ...(workspaceForm.address ?? {}), street: e.target.value } })} />
                  </label>
                  <label className="block text-sm text-slate-300">
                    PLZ / Stadt
                    <div className="mt-2 grid grid-cols-[120px,1fr] gap-2">
                      <Input value={workspaceForm.address?.postalCode ?? ""} onChange={(e) => setWorkspaceForm({ ...workspaceForm, address: { ...(workspaceForm.address ?? {}), postalCode: e.target.value } })} placeholder="10115" />
                      <Input value={workspaceForm.address?.city ?? ""} onChange={(e) => setWorkspaceForm({ ...workspaceForm, address: { ...(workspaceForm.address ?? {}), city: e.target.value } })} placeholder="Berlin" />
                    </div>
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm text-slate-300">
                    Land
                    <Input className="mt-2" value={workspaceForm.address?.country ?? ""} onChange={(e) => setWorkspaceForm({ ...workspaceForm, address: { ...(workspaceForm.address ?? {}), country: e.target.value } })} placeholder="Deutschland" />
                  </label>
                  <label className="block text-sm text-slate-300">
                    Website
                    <Input className="mt-2" value={workspaceForm.website ?? ""} onChange={(e) => setWorkspaceForm({ ...workspaceForm, website: e.target.value })} placeholder="https://" />
                  </label>
                </div>
                <label className="block text-sm text-slate-300">
                  Kurzbeschreibung
                  <Textarea rows={3} className="mt-2" value={workspaceForm.description ?? ""} onChange={(e) => setWorkspaceForm({ ...workspaceForm, description: e.target.value })} placeholder="Was macht dein Unternehmen?" />
                </label>
              </div>

              <div className="space-y-4 rounded-3xl border border-white/10 bg-white/5/10 p-4">
                <div>
                  <p className="text-sm font-semibold text-white">Logo</p>
                  <p className="text-xs text-slate-400">Hochladen, im Drive speichern und hier verwenden.</p>
                  <div className="mt-3 flex items-center gap-4">
                    <div className="h-20 w-20 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                      {logoDownloadUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logoDownloadUrl} alt="Workspace Logo" className="h-full w-full object-contain" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">Kein Logo</div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-2 text-sm text-slate-300">
                      <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="cursor-pointer rounded-full"
                        onClick={() => logoInputRef.current?.click()}
                        disabled={logoUploading}
                      >
                        {logoUploading ? "Lädt…" : "Logo hochladen"}
                      </Button>
                      {workspaceForm.branding?.logoFileId && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="cursor-pointer"
                          onClick={handleLogoRemove}
                        >
                          Entfernen
                        </Button>
                      )}
                      {logoUploadError && <p className="text-xs text-rose-300">{logoUploadError}</p>}
                    </div>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block text-xs text-slate-300">
                    Primary
                    <Input type="color" className="mt-2 h-10 w-full cursor-pointer rounded-lg border border-white/10 bg-transparent" value={workspaceForm.branding?.primaryColor ?? "#0ea5e9"} onChange={(e) => setWorkspaceForm({ ...workspaceForm, branding: { ...(workspaceForm.branding ?? {}), primaryColor: e.target.value } })} />
                  </label>
                  <label className="block text-xs text-slate-300">
                    Secondary
                    <Input type="color" className="mt-2 h-10 w-full cursor-pointer rounded-lg border border-white/10 bg-transparent" value={workspaceForm.branding?.secondaryColor ?? "#0f172a"} onChange={(e) => setWorkspaceForm({ ...workspaceForm, branding: { ...(workspaceForm.branding ?? {}), secondaryColor: e.target.value } })} />
                  </label>
                  <label className="block text-xs text-slate-300">
                    Accent
                    <Input type="color" className="mt-2 h-10 w-full cursor-pointer rounded-lg border border-white/10 bg-transparent" value={workspaceForm.branding?.accentColor ?? "#f97316"} onChange={(e) => setWorkspaceForm({ ...workspaceForm, branding: { ...(workspaceForm.branding ?? {}), accentColor: e.target.value } })} />
                  </label>
                </div>
                <p className="text-xs text-slate-500">
                  Farben wirken sich auf Angebote, PDF-Templates und Mail-Layouts aus.
                </p>
              </div>
            </div>
            {workspaceNotice && <p className="text-xs text-emerald-300">{workspaceNotice}</p>}
            <Button size="sm" type="submit" disabled={workspaceSaving}>
              {workspaceSaving ? "Speichern…" : "Unternehmensprofil speichern"}
            </Button>
          </form>
        </Card>
      )}

      {activeTab === "ai" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="OpenAI Automation" description="Speichere deinen API-Schlüssel für AI-Features.">
            <form className="space-y-4" onSubmit={handleOpenAiSave}>
              <label className="block text-sm text-slate-300">
                OpenAI API-Key
                <input
                  type="password"
                  value={openAiKey}
                  onChange={(event) => setOpenAiKey(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                  placeholder="sk-..."
                />
              </label>
              <p className="text-xs text-slate-500">
                Wird tenant-weit gespeichert (Server), nicht im Browser.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button size="sm" type="submit">Key speichern</Button>
                <Button
                  size="sm"
                  type="button"
                  variant="secondary"
                  onClick={handleOpenAiRemove}
                >
                  Key entfernen
                </Button>
              </div>
              {openAiStatus && <p className="text-xs text-slate-400">{openAiStatus}</p>}
              {openAiSettings?.hasApiKey && (
                <p className="text-xs text-slate-400">
                  Server-Key hinterlegt
                  {openAiSettings.updatedAt ? ` · Aktualisiert: ${openAiSettings.updatedAt}` : ""}
                </p>
              )}
            </form>
          </Card>

          <Card title="Search Key" description="SerpAPI Key für Websuche">
            <form className="space-y-4" onSubmit={handleSerpSave}>
              <label className="block text-sm text-slate-300">
                SerpAPI Key
                <input
                  value={serpApiKey}
                  onChange={(event) => setSerpApiKey(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                  placeholder="serp_api_key"
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <Button size="sm" type="submit">Key speichern</Button>
                <Button
                  size="sm"
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    if (typeof window === "undefined") return;
                    window.localStorage.removeItem(SERPAPI_KEY_STORAGE);
                    setSerpApiKey("");
                    setSerpStatus("SerpAPI-Key entfernt.");
                  }}
                >
                  Key entfernen
                </Button>
              </div>
              {serpStatus && <p className="text-xs text-slate-400">{serpStatus}</p>}
            </form>
          </Card>
        </div>
      )}

      {activeTab === "email" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="SMTP" description="Versandadresse und Zugangsdaten.">
            <form className="space-y-4" onSubmit={handleSmtpSubmit}>
              {smtpNotice && (
                <div
                  className={clsx(
                    "rounded-xl px-3 py-2 text-xs",
                    smtpNotice.startsWith("SMTP gespeichert")
                      ? "border border-emerald-300/30 bg-emerald-500/10 text-emerald-100"
                      : smtpNotice.startsWith("Prüfe")
                        ? "border border-sky-300/30 bg-sky-500/10 text-sky-100"
                        : "border border-rose-300/30 bg-rose-500/10 text-rose-100",
                  )}
                >
                  {smtpNotice}
                </div>
              )}
              {smtpForm.verifiedAt && (
                <div className="rounded-xl border border-emerald-300/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                  Zugriff verifiziert am {new Date(smtpForm.verifiedAt).toLocaleString("de-DE")}
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm text-slate-300">
                  Host
                  <Input className="mt-2" value={smtpForm.host} onChange={(e) => setSmtpForm({ ...smtpForm, host: e.target.value })} />
                </label>
                <label className="text-sm text-slate-300">
                  Port
                  <Input className="mt-2" value={smtpForm.port} onChange={(e) => setSmtpForm({ ...smtpForm, port: Number(e.target.value) })} />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm text-slate-300">
                  Nutzername
                  <Input className="mt-2" value={smtpForm.username} onChange={(e) => setSmtpForm({ ...smtpForm, username: e.target.value })} />
                </label>
                <label className="text-sm text-slate-300">
                  Passwort
                  <Input
                    type="password"
                    className="mt-2"
                    value={smtpPassword}
                    onChange={(e) => setSmtpPassword(e.target.value)}
                    placeholder={smtpForm.hasPassword ? "Gespeichert" : ""}
                  />
                </label>
              </div>
              <label className="text-sm text-slate-300">
                Absendername
                <Input className="mt-2" value={smtpForm.fromName ?? ""} onChange={(e) => setSmtpForm({ ...smtpForm, fromName: e.target.value })} />
              </label>
              <label className="text-sm text-slate-300">
                Absender E-Mail
                <Input className="mt-2" value={smtpForm.fromEmail ?? ""} onChange={(e) => setSmtpForm({ ...smtpForm, fromEmail: e.target.value })} />
              </label>
              <label className="text-sm text-slate-300">
                Verschlüsselung
                <select
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-sky-400 focus:outline-none"
                  value={smtpForm.encryption}
                  onChange={(event) => setSmtpForm({ ...smtpForm, encryption: event.target.value as SmtpEncryption })}
                >
                  <option value="none">Keine</option>
                  <option value="ssl">SSL</option>
                  <option value="tls">TLS</option>
                </select>
              </label>
              {smtpForm.updatedAt && <p className="text-xs text-slate-400">Aktualisiert: {smtpForm.updatedAt}</p>}
              <Button size="sm" type="submit" disabled={smtpSaving}>
                {smtpSaving ? "Speichern…" : "SMTP speichern"}
              </Button>
            </form>
          </Card>

          <Card title="IMAP" description="Eingehende E-Mails synchronisieren.">
            <form className="space-y-4" onSubmit={handleImapSubmit}>
              {imapForm.verifiedAt && (
                <div className="rounded-xl border border-emerald-300/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                  Zugriff verifiziert am {new Date(imapForm.verifiedAt).toLocaleString("de-DE")}
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm text-slate-300">
                  Host
                  <Input className="mt-2" value={imapForm.host} onChange={(e) => setImapForm({ ...imapForm, host: e.target.value })} />
                </label>
                <label className="text-sm text-slate-300">
                  Port
                  <Input className="mt-2" value={imapForm.port} onChange={(e) => setImapForm({ ...imapForm, port: Number(e.target.value) })} />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm text-slate-300">
                  Nutzername
                  <Input className="mt-2" value={imapForm.username} onChange={(e) => setImapForm({ ...imapForm, username: e.target.value })} />
                </label>
                <label className="text-sm text-slate-300">
                  Passwort
                  <Input
                    type="password"
                    className="mt-2"
                    value={imapPassword}
                    onChange={(e) => setImapPassword(e.target.value)}
                    placeholder={imapForm.hasPassword ? "Gespeichert" : ""}
                  />
                </label>
              </div>
              <label className="text-sm text-slate-300">
                Mailbox
                <Input className="mt-2" value={imapForm.mailbox} onChange={(e) => setImapForm({ ...imapForm, mailbox: e.target.value })} />
              </label>
              <label className="text-sm text-slate-300">
                Spam-Mailbox
                <Input
                  className="mt-2"
                  value={imapForm.spamMailbox ?? ""}
                  onChange={(e) => setImapForm({ ...imapForm, spamMailbox: e.target.value })}
                  placeholder="z.B. Spam oder [Gmail]/Spam"
                />
                <p className="mt-1 text-xs text-slate-500">Optional: Ordnername für Spam/Junk.</p>
              </label>
              <label className="text-sm text-slate-300">
                Sync Zeitraum (Tage)
                <Input className="mt-2" value={imapForm.sinceDays} onChange={(e) => setImapForm({ ...imapForm, sinceDays: Number(e.target.value) })} />
              </label>
              <label className="text-sm text-slate-300">
                Verschlüsselung
                <select
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-sky-400 focus:outline-none"
                  value={imapForm.encryption}
                  onChange={(event) => setImapForm({ ...imapForm, encryption: event.target.value as ImapEncryption })}
                >
                  <option value="none">Keine</option>
                  <option value="ssl">SSL</option>
                  <option value="tls">TLS</option>
                </select>
              </label>
              {imapNotice && <p className="text-xs text-emerald-300">{imapNotice}</p>}
              {imapForm.updatedAt && <p className="text-xs text-slate-400">Aktualisiert: {imapForm.updatedAt}</p>}
              <Button size="sm" type="submit" disabled={imapSaving}>
                {imapSaving ? "Speichern…" : "IMAP speichern"}
              </Button>
            </form>
          </Card>

          <Card title="KI-Analyse" description="Eingehende Mails automatisch klassifizieren.">
            <form className="space-y-3" onSubmit={handleAnalysisSubmit}>
              <label className="flex items-center gap-3 text-sm text-slate-300">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-sky-400"
                  checked={analysisSettings.enabled}
                  onChange={(e) => setAnalysisSettings((prev) => ({ ...prev, enabled: e.target.checked }))}
                />
                Analyse für eingehende Nachrichten aktivieren
              </label>
              <p className="text-xs text-slate-400">
                Kategorien: Werbung, Kündigung, Kritisch, Angebot, Kostenvoranschlag, Sonstiges. Nutzt OpenAI mit dem Key aus „AI & Search Keys“ (pro Benutzer, kein Env-Fallback).
              </p>
              {analysisNotice && (
                <p className="text-xs text-emerald-300">{analysisNotice}</p>
              )}
              {analysisSettings.updatedAt && (
                <p className="text-xs text-slate-400">Aktualisiert: {analysisSettings.updatedAt}</p>
              )}
              <Button size="sm" type="submit" disabled={analysisSaving}>
                {analysisSaving ? "Speichern…" : "Einstellung speichern"}
              </Button>
            </form>
          </Card>
        </div>
      )}

      {activeTab === "security" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Sicherheitsstatus" description="Überblick über deine Anmeldedaten.">
            <div className="space-y-3 text-sm text-slate-300">
              <div className="rounded-2xl border border-white/10 bg-white/5/40 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Login</p>
                <p className="text-base text-white">{user?.email ?? "Unbekannt"}</p>
                <p className="text-xs text-slate-500">Zuletzt eingeloggt: {user?.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("de-DE") : "Noch kein Login protokolliert"}</p>
              </div>
              <p className="text-xs text-slate-500">
                Änderungen an Passwort oder E-Mail werden zusätzlich per Sicherheitscode abgesichert. Codes sind 15 Minuten gültig und werden an deine aktuelle Adresse gesendet.
              </p>
            </div>
          </Card>

          <Card title="Login-E-Mail" description="Passe deine Zugangsdaten an. Bestätigungen gehen an alte und neue Adresse.">
            <form className="space-y-4" onSubmit={handleEmailChange}>
              <label className="block text-sm text-slate-300">
                Neue E-Mail-Adresse
                <Input
                  type="email"
                  autoComplete="username"
                  className="mt-2"
                  value={emailForm.newEmail}
                  onChange={(e) => setEmailForm({ ...emailForm, newEmail: e.target.value })}
                  placeholder="maria@example.com"
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
                  onChange={(e) => setEmailForm({ ...emailForm, confirmEmail: e.target.value })}
                  placeholder="Wiederholen"
                  required
                />
              </label>
              <label className="block text-sm text-slate-300">
                Passwort zur Bestätigung
                <Input
                  type="password"
                  autoComplete="current-password"
                  className="mt-2"
                  value={emailForm.currentPassword}
                  onChange={(e) => setEmailForm({ ...emailForm, currentPassword: e.target.value })}
                  placeholder="••••••••"
                  required
                />
              </label>
              <p className="text-xs text-slate-500">Wir senden nach der Änderung eine Bestätigung an deine alte und neue Adresse.</p>
              <Button size="sm" type="submit" disabled={emailSaving}>
                {emailSaving ? "Speichern…" : "E-Mail speichern"}
              </Button>
              {emailNotice && (
                <p className={clsx("text-xs", emailNotice.type === "success" ? "text-emerald-300" : "text-rose-300")}>
                  {emailNotice.text}
                </p>
              )}
            </form>
          </Card>

          <div className="lg:col-span-2">
            <Card title="Passwort über Sicherheitscode" description="Sicherer Reset mit Einmal-Code und 10-Minuten-Timer.">
              <div className="space-y-6 text-sm text-slate-300">
                <div className="rounded-2xl border border-white/10 bg-white/5/40 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Start</p>
                  <p className="text-white">Ein neues Passwort anfordern</p>
                  <p className="mt-2 text-xs text-slate-400">
                    Wir senden einen Sicherheitscode an {resetEmail || "deine Login-Adresse"}. Der Code bleibt 10 Minuten gültig.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <Button type="button" size="sm" onClick={handleOpenResetConfirm} disabled={resetRequesting}>
                      Passwort zurücksetzen
                    </Button>
                  </div>
                </div>

                {resetStep !== "idle" && (
                  <>
                    {resetStep === "code" && (
                      <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5/40 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Code bestätigen</p>
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full text-slate-400"
                            onClick={() => {
                              setResetStep("idle");
                              setResetNotice(null);
                              setResetExpiresAt(null);
                              setResetCodeValidated(false);
                              setResetCode("");
                            }}
                          >
                            ✕
                          </Button>
                        </div>
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                          <div className="relative h-20 w-20">
                            <div className="absolute inset-0 rounded-full border border-white/10" />
                            <div
                              className="absolute inset-0 rounded-full"
                              style={{
                                background: `conic-gradient(#0ea5e9 ${resetProgress}%, rgba(148,163,184,0.2) ${resetProgress}% 100%)`,
                                WebkitMask: "radial-gradient(circle 60%, transparent 55%, black 56%)",
                              }}
                            />
                            <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-white">
                              {Math.floor(resetCountdown / 60)}:{String(resetCountdown % 60).padStart(2, "0")}
                            </div>
                          </div>
                          <div className="flex-1 text-xs text-slate-400">
                            <p>Der Code läuft nach 10 Minuten ab. Fordere bei Bedarf einen neuen Code an.</p>
                            <p className="mt-1 text-slate-500">{resetExpiresAt ? `Gültig bis ${resetExpiresAt.toLocaleTimeString("de-DE")}` : "Kein aktiver Code."}</p>
                          </div>
                        </div>
                        <form className="space-y-3" onSubmit={handleResetCodeValidate}>
                          <label className="block text-sm text-slate-300">
                            Reset-Code eingeben
                            <Input
                              className="mt-2"
                              value={resetCode}
                              onChange={(e) => setResetCode(e.target.value.toUpperCase())}
                              placeholder="z. B. 123456"
                              disabled={resetStep !== "code" || resetRequesting}
                              required
                            />
                          </label>
                          <div className="flex flex-wrap items-center gap-3">
                            <Button size="sm" type="submit" disabled={resetStep !== "code" || resetValidationLoading}>
                              {resetValidationLoading ? "Prüfe…" : "Code bestätigen"}
                            </Button>
                            <Button type="button" size="sm" variant="ghost" onClick={handleResetCodeSend} disabled={resetRequesting}>
                              {resetRequesting ? "Sendet…" : "Code erneut senden"}
                            </Button>
                          </div>
                        </form>
                      </section>
                    )}

                    {resetStep === "password" && (
                      <form className="space-y-4 rounded-2xl border border-white/10 bg-white/5/40 p-4" onSubmit={handleResetPasswordSubmit}>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Neues Passwort</p>
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full text-slate-400"
                            onClick={() => {
                              setResetStep("idle");
                              setResetNotice(null);
                              setResetExpiresAt(null);
                              setResetCodeValidated(false);
                              setResetCode("");
                              setResetNewPassword("");
                              setResetConfirmPassword("");
                            }}
                          >
                            ✕
                          </Button>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="block text-sm text-slate-300">
                            Neues Passwort
                            <Input
                              type="password"
                              className="mt-2"
                              value={resetNewPassword}
                              onChange={(e) => setResetNewPassword(e.target.value)}
                              placeholder="Mindestens 8 Zeichen"
                              disabled={!resetCodeValidated || resetStep !== "password"}
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
                              disabled={!resetCodeValidated || resetStep !== "password"}
                              required
                            />
                          </label>
                        </div>
                        <p className="text-xs text-slate-500">
                          Nach erfolgreicher Änderung erhältst du automatisch eine Benachrichtigung.
                        </p>
                        <Button size="sm" type="submit" disabled={resetSubmitting || !resetCodeValidated || resetStep !== "password"}>
                          {resetSubmitting ? "Aktualisiere…" : "Passwort setzen"}
                        </Button>
                      </form>
                    )}
                  </>
                )}

                {resetNotice && (
                  <p
                    className={clsx(
                      "text-xs",
                      resetNotice.type === "success"
                        ? "text-emerald-300"
                        : resetNotice.type === "info"
                          ? "text-sky-300"
                          : "text-rose-300",
                    )}
                  >
                    {resetNotice.text}
                  </p>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {activeTab === "notifications" && (
        <div className="space-y-4">
          <Card title="Benachrichtigungen" description="Steuere, welche Updates dich erreichen.">
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); setStatus("Benachrichtigungen gespeichert (lokal)."); }}>
              {notificationOptions.map((option) => (
                <label key={option.label} className="flex items-start gap-3 rounded-2xl border border-white/5 bg-white/5/40 p-4">
                  <input type="checkbox" defaultChecked className="mt-1 h-4 w-4 accent-sky-400" />
                  <span>
                    <p className="text-sm font-medium text-white">{option.label}</p>
                    <p className="text-xs text-slate-400">{option.description}</p>
                  </span>
                </label>
              ))}
              <Button size="sm" type="submit">
                Einstellungen sichern
              </Button>
            </form>
          </Card>
        </div>
      )}

      {activeTab === "contact" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Kontaktformular SMTP" description="Eigener SMTP-Zugang für das Kontaktformular. Nur Admins können speichern.">
            <form className="space-y-4" onSubmit={handleContactSmtpSubmit}>
              {contactSmtpNotice && (
                <div
                  className={clsx(
                    "rounded-xl px-3 py-2 text-xs",
                    contactSmtpNotice.startsWith("Kontakt SMTP gespeichert")
                      ? "border border-emerald-300/30 bg-emerald-500/10 text-emerald-100"
                      : contactSmtpNotice.startsWith("Prüfe")
                        ? "border border-sky-300/30 bg-sky-500/10 text-sky-100"
                        : "border border-rose-300/30 bg-rose-500/10 text-rose-100",
                  )}
                >
                  {contactSmtpNotice}
                </div>
              )}
              {contactSmtpForm?.verifiedAt && (
                <div className="rounded-xl border border-emerald-300/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                  Zugriff verifiziert am {new Date(contactSmtpForm.verifiedAt).toLocaleString("de-DE")}
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm text-slate-300">
                  Host
                  <Input
                    className="mt-2"
                    value={contactSmtpForm?.host ?? ""}
                    onChange={(e) =>
                      setContactSmtpForm((prev) => ({ ...(prev ?? {} as ContactSmtpSettings), host: e.target.value }))
                    }
                    required
                  />
                </label>
                <label className="text-sm text-slate-300">
                  Port
                  <Input
                    type="number"
                    min={1}
                    max={65535}
                    step={1}
                    className="mt-2"
                    value={contactSmtpForm?.port ?? 587}
                    onChange={(e) =>
                      setContactSmtpForm((prev) => ({
                        ...(prev ?? {} as ContactSmtpSettings),
                        port: e.target.value === "" ? Number.NaN : Number(e.target.value),
                      }))
                    }
                    required
                  />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm text-slate-300">
                  Nutzername
                  <Input
                    className="mt-2"
                    value={contactSmtpForm?.username ?? ""}
                    onChange={(e) =>
                      setContactSmtpForm((prev) => ({ ...(prev ?? {} as ContactSmtpSettings), username: e.target.value }))
                    }
                    required
                  />
                </label>
                <label className="text-sm text-slate-300">
                  Passwort
                  <Input
                    type="password"
                    className="mt-2"
                    value={contactSmtpPassword}
                    onChange={(e) => setContactSmtpPassword(e.target.value)}
                    placeholder={contactSmtpForm?.hasPassword ? "Gespeichert" : ""}
                  />
                </label>
              </div>
              <label className="text-sm text-slate-300">
                Absendername
                <Input
                  className="mt-2"
                  value={contactSmtpForm?.fromName ?? ""}
                  onChange={(e) =>
                    setContactSmtpForm((prev) => ({ ...(prev ?? {} as ContactSmtpSettings), fromName: e.target.value }))
                  }
                />
              </label>
              <label className="text-sm text-slate-300">
                Absender E-Mail
                <Input
                  className="mt-2"
                  value={contactSmtpForm?.fromEmail ?? ""}
                  onChange={(e) =>
                    setContactSmtpForm((prev) => ({ ...(prev ?? {} as ContactSmtpSettings), fromEmail: e.target.value }))
                  }
                />
              </label>
              <label className="text-sm text-slate-300">
                Verschlüsselung
                <select
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-sky-400 focus:outline-none"
                  value={contactSmtpForm?.encryption ?? "tls"}
                  onChange={(event) =>
                    setContactSmtpForm((prev) => ({
                      ...(prev ?? {} as ContactSmtpSettings),
                      encryption: event.target.value as SmtpEncryption,
                    }))
                  }
                >
                  <option value="none">Keine</option>
                  <option value="ssl">SSL</option>
                  <option value="tls">TLS</option>
                </select>
              </label>
              {contactSmtpForm?.updatedAt && (
                <p className="text-xs text-slate-400">Aktualisiert: {contactSmtpForm.updatedAt}</p>
              )}
              <Button size="sm" type="submit" disabled={contactSmtpSaving}>
                {contactSmtpSaving ? "Speichern…" : "Kontakt SMTP speichern"}
              </Button>
            </form>
          </Card>
        </div>
      )}
      </section>

      <Modal
        isOpen={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        title="Passwort zurücksetzen?"
      >
        <p className="text-sm text-slate-300">
          Wir senden sofort einen Sicherheitscode an {resetEmail || "deine Login-Adresse"}. Der Code bleibt 10 Minuten gültig.
          Nach erfolgreicher Eingabe kannst du direkt ein neues Passwort definieren.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button type="button" variant="ghost" className="flex-1" onClick={() => setResetConfirmOpen(false)}>
            Nein, abbrechen
          </Button>
          <Button type="button" className="flex-1" onClick={handleConfirmResetStart} disabled={resetRequesting}>
            {resetRequesting ? "Sende…" : "Ja, Code senden"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
