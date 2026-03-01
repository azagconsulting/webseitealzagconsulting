"use client";

import {
  AlertTriangle,
  HardDrive,
  Loader2,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CustomerMessage,
  Lead,
  SmtpSettings,
  Customer,
  CustomerContact,
  DriveFile,
  DriveFileListResponse,
  DriveScope,
  GoogleDriveFile,
  GoogleDriveFileListResponse,
  GoogleDriveSharedDrive,
  GoogleDriveStatus,
} from "@/lib/types";
import { useAuth } from "@/components/auth-provider";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { buildApiUrl } from "@/lib/api";

interface AttachmentItem {
  id: string;
  file: File;
  url: string;
}

interface ComposerState {
  contactId: string;
  toEmail: string;
  subject: string;
  body: string;
}

interface ComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMessageSent: (message: CustomerMessage) => void;
  customer?: Customer | null;
  lead?: Lead | null;
  thread?: CustomerMessage[];
  messageToReplyTo?: CustomerMessage | null;
  smtpReady: boolean;
  smtpStatus: string | null;
  contactSuggestions?: {
    id?: string;
    name?: string | null;
    email?: string | null;
    customerName?: string | null;
  }[];
}

const formatSize = (value: number) => {
  if (!value || value <= 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx += 1;
  }
  return `${idx === 0 ? size : size.toFixed(1)} ${units[idx]}`;
};

export function ComposerModal({
  isOpen,
  onClose,
  onMessageSent,
  customer,
  lead,
  thread = [],
  messageToReplyTo,
  smtpReady,
  smtpStatus,
  contactSuggestions = [],
}: ComposerModalProps) {
  const { authorizedRequest, user, tokens } = useAuth();
  const STORAGE_KEY = "workspace/messages/composer-state";
  const [composer, setComposer] = useState<ComposerState>({
    contactId: "",
    toEmail: "",
    subject: "",
    body: "",
  });
  const [composerNotice, setComposerNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [openAiKey, setOpenAiKey] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [aiChatMode, setAiChatMode] = useState<null | "edit" | "create">(null);
  const [aiChatInput, setAiChatInput] = useState("");
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const wasOpenRef = useRef(false);
  const lastInitKeyRef = useRef<string | null>(null);
  const mountedRef = useRef(false);
  const [contactMenuOpen, setContactMenuOpen] = useState(false);
  const [contactHover, setContactHover] = useState(0);
  const [drivePickerOpen, setDrivePickerOpen] = useState(false);
  const [drivePickerFiles, setDrivePickerFiles] = useState<DriveFile[]>([]);
  const [drivePickerLoading, setDrivePickerLoading] = useState(false);
  const [drivePickerError, setDrivePickerError] = useState<string | null>(null);
  const [drivePickerScope, setDrivePickerScope] = useState<DriveScope>("USER");
  const [drivePickerSearch, setDrivePickerSearch] = useState("");
  const [driveAttachBusyId, setDriveAttachBusyId] = useState<string | null>(null);
  const [drivePickerSource, setDrivePickerSource] = useState<"ARCTO" | "GOOGLE">("ARCTO");
  const [googlePickerStatus, setGooglePickerStatus] = useState<GoogleDriveStatus | null>(null);
  const [googlePickerStatusLoading, setGooglePickerStatusLoading] = useState(false);
  const [googlePickerStatusError, setGooglePickerStatusError] = useState<string | null>(null);
  const [googlePickerFiles, setGooglePickerFiles] = useState<GoogleDriveFile[]>([]);
  const [googlePickerLoading, setGooglePickerLoading] = useState(false);
  const [googlePickerError, setGooglePickerError] = useState<string | null>(null);
  const [googlePickerSearch, setGooglePickerSearch] = useState("");
  const [googlePickerPageToken, setGooglePickerPageToken] = useState<string | null>(null);
  const [googlePickerNextPageToken, setGooglePickerNextPageToken] = useState<string | null>(null);
  const [googlePickerPageTokens, setGooglePickerPageTokens] = useState<(string | null)[]>([]);
  const [googlePickerCollection, setGooglePickerCollection] = useState<"my-drive" | "shared-drives">("my-drive");
  const [googlePickerSharedDrives, setGooglePickerSharedDrives] = useState<GoogleDriveSharedDrive[]>([]);
  const [googlePickerSharedDriveId, setGooglePickerSharedDriveId] = useState<string | null>(null);
  const [googlePickerSharedLoading, setGooglePickerSharedLoading] = useState(false);
  const [googleAttachBusyId, setGoogleAttachBusyId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    authorizedRequest<{ hasApiKey: boolean; apiKey?: string | null }>("/settings/openai", {
      signal: controller.signal,
    })
      .then((data) => {
        if (!mounted) return;
        const key = data?.apiKey?.trim() || null;
        setOpenAiKey(key);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [authorizedRequest]);

  const attachmentsRef = useRef<AttachmentItem[]>([]);
  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  const normalizedSuggestions = useMemo(() => {
    const map = new Map<string, { id?: string; name?: string | null; email: string; customerName?: string | null }>();
    contactSuggestions?.forEach((item) => {
      const email = item.email?.trim().toLowerCase();
      if (!email) return;
      if (!map.has(email)) {
        map.set(email, {
          id: item.id,
          name: item.name,
          email,
          customerName: item.customerName,
        });
      }
    });
    return Array.from(map.values());
  }, [contactSuggestions]);

  const filteredContacts = useMemo(() => {
    const query = composer.toEmail.split(/[;,]/).pop()?.trim().toLowerCase() ?? "";
    if (!query) return [];
    return normalizedSuggestions
      .filter(
        (item) =>
          item.email.includes(query) ||
          (item.name?.toLowerCase().includes(query)) ||
          (item.customerName?.toLowerCase().includes(query)),
      )
      .slice(0, 8);
  }, [composer.toEmail, normalizedSuggestions]);

  useEffect(() => {
    setContactHover(0);
  }, [composer.toEmail]);

  // Restore persisted draft on first mount
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { composer?: ComposerState };
      if (parsed?.composer) {
        setComposer(parsed.composer);
      }
    } catch {
      // ignore corrupted draft
    }
  }, []);

// Persist draft while typing/attaching
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ composer }),
      );
    } catch {
      // ignore storage write errors
    }
  }, [composer]);

  const clearDraft = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const handleSelectContactSuggestion = useCallback(
    (suggestion: { id?: string; email: string }) => {
      setComposer((prev) => {
        const current = prev.toEmail;
        const lastSeparator = Math.max(current.lastIndexOf(","), current.lastIndexOf(";"));
        if (lastSeparator === -1) {
          return {
            ...prev,
            toEmail: suggestion.email,
            contactId: suggestion.id ?? "",
          };
        }
        const prefix = current.slice(0, lastSeparator + 1).trimEnd();
        const nextValue = `${prefix} ${suggestion.email}`.trim();
        return {
          ...prev,
          toEmail: nextValue,
          contactId: "",
        };
      });
      setContactMenuOpen(false);
      setContactHover(0);
    },
    [],
  );

  useEffect(() => {
    return () => {
      attachmentsRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, []);

  const loadDrivePickerFiles = useCallback(
    async (options?: { signal?: AbortSignal }) => {
      setDrivePickerLoading(true);
      setDrivePickerError(null);
      try {
        const params = new URLSearchParams();
        params.set("scope", drivePickerScope);
        params.set("limit", "20");
        params.set("page", "1");
        if (drivePickerSearch.trim()) {
          params.set("search", drivePickerSearch.trim());
        }
        const response = await authorizedRequest<DriveFileListResponse>(`/drive/files?${params.toString()}`, {
          signal: options?.signal,
        });
        setDrivePickerFiles(response?.items ?? []);
      } catch (err) {
        if (options?.signal?.aborted) {
          return;
        }
        setDrivePickerError(err instanceof Error ? err.message : "Drive-Dateien konnten nicht geladen werden.");
      } finally {
        if (!options?.signal?.aborted) {
          setDrivePickerLoading(false);
        }
      }
    },
    [authorizedRequest, drivePickerScope, drivePickerSearch],
  );

  const loadGooglePickerStatus = useCallback(
    async (options?: { signal?: AbortSignal }) => {
      setGooglePickerStatusLoading(true);
      setGooglePickerStatusError(null);
      try {
        const data = await authorizedRequest<GoogleDriveStatus>("/drive/google/status", {
          signal: options?.signal,
        });
        setGooglePickerStatus(data ?? null);
      } catch (err) {
        if (options?.signal?.aborted) return;
        setGooglePickerStatusError(err instanceof Error ? err.message : "Google Drive Status konnte nicht geladen werden.");
      } finally {
        if (!options?.signal?.aborted) {
          setGooglePickerStatusLoading(false);
        }
      }
    },
    [authorizedRequest],
  );

  const loadGooglePickerSharedDrives = useCallback(
    async (options?: { signal?: AbortSignal }) => {
      setGooglePickerSharedLoading(true);
      try {
        const data = await authorizedRequest<GoogleDriveSharedDrive[]>("/drive/google/shared-drives", {
          signal: options?.signal,
        });
        const drives = data ?? [];
        setGooglePickerSharedDrives(drives);
        if (!googlePickerSharedDriveId && drives.length > 0) {
          setGooglePickerSharedDriveId(drives[0].id);
        }
      } catch (err) {
        if (options?.signal?.aborted) return;
        setGooglePickerError(err instanceof Error ? err.message : "Shared Drives konnten nicht geladen werden.");
      } finally {
        if (!options?.signal?.aborted) {
          setGooglePickerSharedLoading(false);
        }
      }
    },
    [authorizedRequest, googlePickerSharedDriveId],
  );

  const resetGooglePickerPagination = useCallback(() => {
    setGooglePickerPageToken(null);
    setGooglePickerNextPageToken(null);
    setGooglePickerPageTokens([]);
  }, []);

  const loadGooglePickerFiles = useCallback(
    async (options?: { signal?: AbortSignal }) => {
      if (!googlePickerStatus?.connected) {
        setGooglePickerFiles([]);
        setGooglePickerNextPageToken(null);
        return;
      }
      if (googlePickerCollection === "shared-drives" && !googlePickerSharedDriveId) {
        setGooglePickerFiles([]);
        setGooglePickerNextPageToken(null);
        return;
      }
      setGooglePickerLoading(true);
      setGooglePickerError(null);
      try {
        const params = new URLSearchParams();
        params.set("pageSize", "20");
        if (googlePickerSearch.trim()) {
          params.set("search", googlePickerSearch.trim());
        }
        if (googlePickerPageToken) {
          params.set("pageToken", googlePickerPageToken);
        }
        if (googlePickerCollection === "shared-drives" && googlePickerSharedDriveId) {
          params.set("driveId", googlePickerSharedDriveId);
        }
        const response = await authorizedRequest<GoogleDriveFileListResponse>(
          `/drive/google/files?${params.toString()}`,
          { signal: options?.signal },
        );
        setGooglePickerFiles(response?.items ?? []);
        setGooglePickerNextPageToken(response?.nextPageToken ?? null);
      } catch (err) {
        if (options?.signal?.aborted) return;
        setGooglePickerError(err instanceof Error ? err.message : "Google Drive Dateien konnten nicht geladen werden.");
      } finally {
        if (!options?.signal?.aborted) {
          setGooglePickerLoading(false);
        }
      }
    },
    [authorizedRequest, googlePickerCollection, googlePickerPageToken, googlePickerSearch, googlePickerSharedDriveId, googlePickerStatus?.connected],
  );

  const handleGooglePickerConnect = useCallback(async () => {
    setGooglePickerStatusError(null);
    try {
      const returnTo =
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : "/drive?tab=google";
      const data = await authorizedRequest<{ url: string }>(
        `/drive/google/auth-url?returnTo=${encodeURIComponent(returnTo)}`,
      );
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setGooglePickerStatusError(err instanceof Error ? err.message : "Google Drive Verbindung fehlgeschlagen.");
    }
  }, [authorizedRequest]);

  const handleGooglePickerDisconnect = useCallback(async () => {
    try {
      await authorizedRequest("/drive/google/disconnect", { method: "POST" });
      setGooglePickerFiles([]);
      resetGooglePickerPagination();
      await loadGooglePickerStatus();
    } catch (err) {
      setGooglePickerStatusError(err instanceof Error ? err.message : "Google Drive konnte nicht getrennt werden.");
    }
  }, [authorizedRequest, loadGooglePickerStatus, resetGooglePickerPagination]);

  useEffect(() => {
    if (!drivePickerOpen || drivePickerSource !== "ARCTO") {
      return;
    }
    const controller = new AbortController();
    loadDrivePickerFiles({ signal: controller.signal }).catch(() => undefined);
    return () => controller.abort();
  }, [drivePickerOpen, drivePickerScope, drivePickerSearch, drivePickerSource, loadDrivePickerFiles]);

  useEffect(() => {
    if (!drivePickerOpen || drivePickerSource !== "GOOGLE") {
      return;
    }
    const controller = new AbortController();
    loadGooglePickerStatus({ signal: controller.signal }).catch(() => undefined);
    return () => controller.abort();
  }, [drivePickerOpen, drivePickerSource, loadGooglePickerStatus]);

  useEffect(() => {
    if (!drivePickerOpen || drivePickerSource !== "GOOGLE" || !googlePickerStatus?.connected) {
      return;
    }
    const controller = new AbortController();
    loadGooglePickerFiles({ signal: controller.signal }).catch(() => undefined);
    return () => controller.abort();
  }, [
    drivePickerOpen,
    drivePickerSource,
    googlePickerCollection,
    googlePickerPageToken,
    googlePickerSearch,
    googlePickerSharedDriveId,
    googlePickerStatus?.connected,
    loadGooglePickerFiles,
  ]);

  useEffect(() => {
    if (
      !drivePickerOpen ||
      drivePickerSource !== "GOOGLE" ||
      !googlePickerStatus?.connected ||
      googlePickerCollection !== "shared-drives"
    ) {
      return;
    }
    const controller = new AbortController();
    loadGooglePickerSharedDrives({ signal: controller.signal }).catch(() => undefined);
    return () => controller.abort();
  }, [
    drivePickerOpen,
    drivePickerSource,
    googlePickerCollection,
    googlePickerStatus?.connected,
    loadGooglePickerSharedDrives,
  ]);

  useEffect(() => {
    if (!drivePickerOpen || drivePickerSource !== "GOOGLE") {
      return;
    }
    resetGooglePickerPagination();
  }, [
    drivePickerOpen,
    drivePickerSource,
    googlePickerCollection,
    googlePickerSearch,
    googlePickerSharedDriveId,
    resetGooglePickerPagination,
  ]);

  useEffect(() => {
    if (!drivePickerOpen) {
      setDrivePickerSearch("");
      setDrivePickerError(null);
      setDriveAttachBusyId(null);
      setDrivePickerFiles([]);
      setDrivePickerSource("ARCTO");
      setGooglePickerStatus(null);
      setGooglePickerStatusLoading(false);
      setGooglePickerStatusError(null);
      setGooglePickerFiles([]);
      setGooglePickerLoading(false);
      setGooglePickerError(null);
      setGooglePickerSearch("");
      setGooglePickerPageToken(null);
      setGooglePickerNextPageToken(null);
      setGooglePickerPageTokens([]);
      setGooglePickerCollection("my-drive");
      setGooglePickerSharedDrives([]);
      setGooglePickerSharedDriveId(null);
      setGooglePickerSharedLoading(false);
      setGoogleAttachBusyId(null);
    }
  }, [drivePickerOpen]);

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      setComposerNotice(null);
      setAiError(null);
      setContactMenuOpen(false);
      setDrivePickerOpen(false);
      setDrivePickerError(null);
      setDriveAttachBusyId(null);
      setDrivePickerSearch("");
      setDrivePickerFiles([]);
      return;
    }

    const initKey = [
      messageToReplyTo?.id ?? "",
      customer?.id ?? "",
      lead?.id ?? "",
    ].join("|");

    if (wasOpenRef.current && lastInitKeyRef.current === initKey) {
      // Already initialized for this context; do not wipe user input on refresh.
      return;
    }

    wasOpenRef.current = true;
    lastInitKeyRef.current = initKey;

    const recipient = messageToReplyTo?.fromEmail ?? lead?.email ?? customer?.contacts?.[0]?.email ?? "";
    const subject = messageToReplyTo?.subject
      ? messageToReplyTo.subject.startsWith("Re: ")
        ? messageToReplyTo.subject
        : `Re: ${messageToReplyTo.subject}`
      : "";
    const quotedBody = messageToReplyTo?.body ? `\n\n---\nOriginal:\n${messageToReplyTo.body}` : "";

    setComposer({
      contactId: customer?.contacts?.[0]?.id ?? "",
      toEmail: recipient,
      subject,
      body: quotedBody,
    });
    setAttachments([]);
    clearDraft();
    setContactMenuOpen(false);
  }, [isOpen, customer?.id, lead?.id, messageToReplyTo?.id, clearDraft]);

  const handleAttachmentSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    setAttachments((prev) => [
      ...prev,
      ...files.map((file) => ({
        id: `${Date.now()}-${file.name}`,
        file,
        url: URL.createObjectURL(file),
      })),
    ]);
    event.target.value = "";
  };

  const handleAttachmentRemove = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((item) => item.id !== id);
    });
  };

  const handleAttachDriveFile = useCallback(
    async (file: DriveFile) => {
      const accessToken = tokens?.accessToken;
      if (!accessToken) {
        setDrivePickerError("Kein Zugriffstoken verfügbar. Bitte erneut anmelden.");
        return;
      }
      setDrivePickerError(null);
      setDriveAttachBusyId(file.id);
      try {
        const response = await fetch(buildApiUrl(`/drive/files/${file.id}/download`), {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        if (!response.ok) {
          throw new Error("Datei konnte nicht aus dem Drive geladen werden.");
        }
        const blob = await response.blob();
        const resolvedFile = new File([blob], file.name, {
          type: file.mimeType || blob.type || "application/octet-stream",
        });
        setAttachments((prev) => [
          ...prev,
          {
            id: `drive-${file.id}-${Date.now()}`,
            file: resolvedFile,
            url: URL.createObjectURL(resolvedFile),
          },
        ]);
      } catch (err) {
        setDrivePickerError(err instanceof Error ? err.message : "Drive-Datei konnte nicht angehängt werden.");
      } finally {
        setDriveAttachBusyId(null);
      }
    },
    [tokens?.accessToken],
  );

  const handleAttachGoogleFile = useCallback(
    async (file: GoogleDriveFile) => {
      const accessToken = tokens?.accessToken;
      if (!accessToken) {
        setGooglePickerError("Kein Zugriffstoken verfügbar. Bitte erneut anmelden.");
        return;
      }
      if (googlePickerStatus?.maxFileSizeMb && file.size && file.size > googlePickerStatus.maxFileSizeMb * 1024 * 1024) {
        setGooglePickerError(`Datei ist zu groß. Maximal ${googlePickerStatus.maxFileSizeMb} MB erlaubt.`);
        return;
      }
      setGoogleAttachBusyId(file.id);
      setGooglePickerError(null);
      try {
        const params = new URLSearchParams();
        if (googlePickerCollection === "shared-drives" && (file.driveId ?? googlePickerSharedDriveId)) {
          params.set("driveId", file.driveId ?? googlePickerSharedDriveId ?? "");
        }
        const response = await fetch(
          buildApiUrl(`/drive/google/files/${file.id}/download${params.toString() ? `?${params.toString()}` : ""}`),
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );
        if (!response.ok) {
          throw new Error("Datei konnte nicht aus Google Drive geladen werden.");
        }
        const blob = await response.blob();
        const header = response.headers.get("content-disposition");
        const utfName = header?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
        const plainName = header?.match(/filename=\"?([^\";]+)\"?/i)?.[1];
        const resolvedName = utfName ? decodeURIComponent(utfName) : plainName ?? file.name;
        const resolvedFile = new File([blob], resolvedName, {
          type: response.headers.get("content-type") || file.mimeType || blob.type || "application/octet-stream",
        });
        setAttachments((prev) => [
          ...prev,
          {
            id: `google-${file.id}-${Date.now()}`,
            file: resolvedFile,
            url: URL.createObjectURL(resolvedFile),
          },
        ]);
      } catch (err) {
        setGooglePickerError(err instanceof Error ? err.message : "Google Drive Datei konnte nicht angehängt werden.");
      } finally {
        setGoogleAttachBusyId(null);
      }
    },
    [googlePickerCollection, googlePickerSharedDriveId, googlePickerStatus?.maxFileSizeMb, tokens?.accessToken],
  );

  const handleGooglePickerNextPage = () => {
    if (!googlePickerNextPageToken) return;
    setGooglePickerPageTokens((prev) => [...prev, googlePickerPageToken]);
    setGooglePickerPageToken(googlePickerNextPageToken);
  };

  const handleGooglePickerPrevPage = () => {
    if (googlePickerPageTokens.length === 0) return;
    setGooglePickerPageTokens((prev) => {
      const next = [...prev];
      const token = next.pop() ?? null;
      setGooglePickerPageToken(token);
      return next;
    });
  };

  const readFileAsBase64 = useCallback((file: File) =>
    new Promise<{ name: string; type: string; size: number; data: string }>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        resolve({ name: file.name, type: file.type || "application/octet-stream", size: file.size, data: base64 });
      };
      reader.onerror = () => reject(reader.error ?? new Error("Datei konnte nicht gelesen werden."));
      reader.readAsDataURL(file);
    }), []);

  const handleSend = useCallback(async () => {
    if (!smtpReady) {
      setComposerNotice({ type: "error", text: "SMTP-Zugang fehlt. Bitte aktualisiere deine Einstellungen." });
      return;
    }

    const hasAttachments = attachments.length > 0;
    const trimmedBody = composer.body.trim();
    if (!trimmedBody && !hasAttachments) {
      setComposerNotice({ type: "error", text: "Bitte Nachricht eingeben oder eine Datei anhängen." });
      return;
    }

    setSending(true);
    setComposerNotice(null);

    let encodedAttachments: Awaited<ReturnType<typeof readFileAsBase64>>[] = [];
    try {
      if (hasAttachments) {
        encodedAttachments = await Promise.all(attachments.map((item) => readFileAsBase64(item.file)));
      }
    } catch (err) {
      setSending(false);
      setComposerNotice({ type: "error", text: err instanceof Error ? err.message : "Anhänge konnten nicht gelesen werden." });
      return;
    }

    const trimmedToEmail = composer.toEmail.trim();
    const hasMultipleRecipients = /[,;]/.test(trimmedToEmail);
    const basePayload = {
      contactId: !hasMultipleRecipients ? (composer.contactId || undefined) : undefined,
      toEmail: trimmedToEmail || undefined,
      subject: composer.subject.trim() || undefined,
      body: trimmedBody || "Siehe angehängte Dateien.",
      ...(encodedAttachments.length ? { attachments: encodedAttachments } : {}),
    };

    try {
      const buildRequestInit = (payload: Record<string, unknown>) => ({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let response: CustomerMessage;
      if (lead) {
        const leadPayload = { ...basePayload, toEmail: basePayload.toEmail || lead.email || undefined };
        response = await authorizedRequest<CustomerMessage>(`/leads/${lead.id}/messages`, buildRequestInit(leadPayload));
      } else if (customer) {
        response = await authorizedRequest<CustomerMessage>(`/customers/${customer.id}/messages`, buildRequestInit(basePayload));
      } else if (basePayload.toEmail) { // Unassigned message
        response = await authorizedRequest<CustomerMessage>(`/messages/unassigned`, buildRequestInit(basePayload));
      } else {
        throw new Error("Kein Empfänger für die Nachricht gefunden.");
      }

      onMessageSent(response);
      setComposerNotice({ type: "success", text: "Nachricht gesendet!" });
      clearDraft();
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setComposerNotice({ type: "error", text: err instanceof Error ? err.message : "Senden fehlgeschlagen." });
    } finally {
      setSending(false);
    }
  }, [smtpReady, attachments, composer, lead, customer, authorizedRequest, readFileAsBase64, onMessageSent, onClose, clearDraft]);

  // ... AI handlers here
  const googlePickerPageIndex = googlePickerPageTokens.length + 1;
  const googlePickerCanPrev = googlePickerPageTokens.length > 0;
  const googlePickerCanNext = Boolean(googlePickerNextPageToken);
  const googlePickerSharedDriveName = googlePickerSharedDrives.find((drive) => drive.id === googlePickerSharedDriveId)?.name;

  const selectedContact = useMemo(() => {
    if (!customer) return null;
    return customer.contacts.find((contact) => contact.id === composer.contactId) ?? null;
  }, [customer, composer.contactId]);

  const handleContactChange = (contactId: string) => {
    if (!customer) return;
    const contact = customer.contacts.find((item) => item.id === contactId);
    setComposer((current) => ({
      ...current,
      contactId,
      toEmail: contact?.email ?? "",
    }));
  };

  const isUnassignedView = !customer && !lead;

  const orderedThread = useMemo(() => {
    return [...(thread ?? [])].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }, [thread]);
  const lastInboundFromThread = useMemo(() => {
    const targetEmail = composer.toEmail.trim().toLowerCase();
    const inbound = [...orderedThread]
      .filter((msg) => msg.direction === "INBOUND")
      .reverse();
    const matchByEmail = targetEmail
      ? inbound.find((msg) => msg.fromEmail?.toLowerCase() === targetEmail)
      : null;
    return matchByEmail ?? inbound[0] ?? null;
  }, [orderedThread, composer.toEmail]);

  const senderDisplayName = useMemo(() => {
    const full = `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim();
    return full || user?.email || "Ihr Team";
  }, [user?.email, user?.firstName, user?.lastName]);

  const appendClosing = useCallback(
    (text: string) => {
      const closing = `\n\nFreundliche Grüße\n${senderDisplayName}`;
      if (!text) return closing.trim();
      if (text.toLowerCase().includes("freundliche grüße")) {
        return text;
      }
      return `${text.trim()}\n${closing}`;
    },
    [senderDisplayName],
  );

  const handleGenerateAi = useCallback(async () => {
    if (!openAiKey) {
      setAiError("Bitte hinterlege zuerst deinen OpenAI-Key in den Einstellungen.");
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try {
      const lastInbound = lastInboundFromThread;
      const history = lastInbound
        ? `${lastInbound.direction === "INBOUND" ? "Letzte Nachricht vom Kontakt" : "Letzte gesendete Nachricht"}:\n${lastInbound.body}`
        : "Keine letzte Nachricht gefunden.";
      const contactName = lead?.fullName ?? selectedContact?.name ?? customer?.name ?? "Kontakt";
      const prompt = `Du bist Customer Success Manager:in bei Arcto. Verfasse eine prägnante, empathische Antwort per E-Mail an ${contactName}. Betreff: ${composer.subject}\nKontext:\n${history || "Der Kontakt wartet auf ein Update."}\nDie Antwort darf maximal 220 Wörter haben und sollte mit einer freundlichen Grußformel enden.`;

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${openAiKey}` },
        body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0.5, messages: [{ role: "system", content: "Du hilfst Customer Success Teams beim Schreiben von professionellen Antworten." }, { role: "user", content: prompt }] }),
      });
      if (!response.ok) throw new Error(`OpenAI-Fehler: ${response.status}`);
      const body = await response.json();
      const content = body?.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error("Keine Antwort von OpenAI erhalten.");
      setComposer((current) => ({ ...current, body: appendClosing(content) }));
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "KI-Antwort konnte nicht erzeugt werden.");
    } finally {
      setAiLoading(false);
    }
  }, [openAiKey, lastInboundFromThread, lead, selectedContact, customer, composer.subject, appendClosing]);

  const handleAiCreateWithPrompt = useCallback(async (promptInput: string) => {
    if (!openAiKey) {
      setAiError("Bitte hinterlege zuerst deinen OpenAI-Key in den Einstellungen.");
      return;
    }
    if (!promptInput) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const contactName = lead?.fullName ?? selectedContact?.name ?? customer?.name ?? composer.toEmail;
      const prompt = `Du bist ein hilfreicher Assistent. Schreibe eine professionelle E-Mail an ${contactName} zum Thema "${composer.subject}". Die E-Mail soll folgendes beinhalten: "${promptInput}".`;
      
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${openAiKey}` },
        body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0.7, messages: [{ role: "system", content: "Du bist ein Assistent, der beim Verfassen von professionellen E-Mails in deutscher Sprache hilft." }, { role: "user", content: prompt }] }),
      });
      if (!response.ok) throw new Error(`OpenAI-Fehler: ${response.status}`);
      const body = await response.json();
      const content = body?.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error("Keine Antwort von OpenAI erhalten.");
      setComposer((current) => ({ ...current, body: appendClosing(content) }));
      setAiChatMode(null);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "KI-Antwort konnte nicht erzeugt werden.");
    } finally {
      setAiLoading(false);
    }
  }, [openAiKey, lead, selectedContact, customer, composer.toEmail, composer.subject, appendClosing]);

  const handleAiEditWithPrompt = useCallback(async (promptInput: string) => {
    if (!openAiKey) {
      setAiError("Bitte hinterlege zuerst deinen OpenAI-Key in den Einstellungen.");
      return;
    }
    if (!promptInput || !composer.body) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const prompt = `Bitte überarbeite den folgenden E-Mail-Entwurf. Gib nur die neue Version der E-Mail aus, ohne zusätzliche Kommentare.\n\nAnweisung: "${promptInput}"\n\nEntwurf:\n---\n${composer.body}`;
      
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${openAiKey}` },
        body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0.5, messages: [{ role: "system", content: "Du bist ein Assistent, der dabei hilft, E-Mails zu überarbeiten und zu verbessern." }, { role: "user", content: prompt }] }),
      });
      if (!response.ok) throw new Error(`OpenAI-Fehler: ${response.status}`);
      const body = await response.json();
      const content = body?.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error("Keine Antwort von OpenAI erhalten.");
      setComposer((current) => ({ ...current, body: content }));
      setAiChatMode(null);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "KI-Antwort konnte nicht erzeugt werden.");
    } finally {
      setAiLoading(false);
    }
  }, [openAiKey, composer.body]);


  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Nachricht verfassen" className="max-w-3xl">
      <div className="space-y-4">
        {!smtpReady && smtpStatus && (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-100">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <p>{smtpStatus}</p>
          </div>
        )}

        <div className="grid grid-cols-6 gap-4">
          <label className="col-span-1 my-auto text-sm text-slate-400">An:</label>
          <div className="col-span-5">
            {customer && customer.contacts.length > 1 ? (
              <select 
                value={composer.contactId}
                onChange={(e) => handleContactChange(e.target.value)}
                className="w-full rounded-md border-slate-700 bg-slate-800 p-2 text-sm text-white"
              >
                {customer.contacts.map((contact: CustomerContact) => (
                  <option key={contact.id} value={contact.id}>{contact.name} ({contact.email})</option>
                ))}
              </select>
            ) : (
              <>
                <div className="relative">
                  <Input
                    type="email"
                    multiple
                    placeholder="Empfänger-E-Mail"
                    value={composer.toEmail}
                    onFocus={() => setContactMenuOpen(true)}
                    onChange={(e) => {
                      setComposer({ ...composer, toEmail: e.target.value, contactId: "" });
                      setContactMenuOpen(true);
                    }}
                    onBlur={() => {
                      setTimeout(() => setContactMenuOpen(false), 100);
                    }}
                    onKeyDown={(e) => {
                      if (!filteredContacts.length) return;
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setContactHover((prev) => (prev + 1) % filteredContacts.length);
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setContactHover((prev) => (prev - 1 + filteredContacts.length) % filteredContacts.length);
                      } else if (e.key === "Enter") {
                        const target = filteredContacts[contactHover];
                        if (target) {
                          e.preventDefault();
                          handleSelectContactSuggestion(target);
                        }
                      } else if (e.key === "Escape") {
                        setContactMenuOpen(false);
                      }
                    }}
                    className="text-sm"
                  />
                  {contactMenuOpen && filteredContacts.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full rounded-xl border border-white/10 bg-slate-900/95 shadow-lg backdrop-blur">
                      {filteredContacts.map((item, index) => (
                        <button
                          key={`${item.email}-${index}`}
                          type="button"
                          onMouseEnter={() => setContactHover(index)}
                          onClick={() => handleSelectContactSuggestion(item)}
                          className={clsx(
                            "w-full px-3 py-2 text-left text-sm text-slate-100 hover:bg-white/5",
                            contactHover === index && "bg-white/10",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-medium">{item.name || item.customerName || item.email}</span>
                            {item.customerName && (
                              <span className="truncate text-xs text-slate-400">{item.customerName}</span>
                            )}
                          </div>
                          <p className="truncate text-xs text-slate-400">{item.email}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">Mehrere Empfänger mit Komma trennen.</p>
              </>
            )}
          </div>
        </div>
        <div className="grid grid-cols-6 items-center gap-4">
          <label className="col-span-1 text-sm text-slate-400">Betreff:</label>
          <div className="col-span-5">
            <Input
              type="text"
              placeholder="Betreff"
              value={composer.subject}
              onChange={(e) => setComposer({ ...composer, subject: e.target.value })}
              className="text-sm"
            />
          </div>
        </div>
        
        <Textarea
          placeholder="Schreibe deine Nachricht..."
          value={composer.body}
          onChange={(e) => setComposer({ ...composer, body: e.target.value })}
          rows={10}
          className="resize-y text-sm"
        />

        {attachments.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-slate-400">Anhänge</p>
            {attachments.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-lg bg-slate-800 p-2 text-sm">
                <div className="flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-slate-400" />
                  <span className="text-white">{item.file.name}</span>
                  <span className="text-slate-500 text-xs">({Math.round(item.file.size / 1024)} KB)</span>
                </div>
                <button onClick={() => handleAttachmentRemove(item.id)}>
                  <X className="h-4 w-4 text-slate-400 hover:text-white" />
                </button>
              </div>
            ))}
          </div>
        )}
        
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Paperclip className="mr-2 h-4 w-4" /> Anhang
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDrivePickerOpen(true)}>
              <HardDrive className="mr-2 h-4 w-4" /> + Drive
            </Button>
            <input type="file" ref={fileInputRef} onChange={handleAttachmentSelect} multiple className="hidden" />
          </div>
          <Button onClick={handleSend} disabled={sending || !composer.toEmail.trim() || (!composer.body.trim() && attachments.length === 0)}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            Senden
          </Button>
        </div>

        {composerNotice && (
          <p className={clsx("text-sm", composerNotice.type === "success" ? "text-emerald-400" : "text-rose-400")}>
            {composerNotice.text}
          </p>
        )}

        <div className="space-y-4 border-t border-white/10 pt-4 mt-4" style={{marginBottom: '5px'}}>
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-2">
                <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-slate-400 ml-2" />
                    <span className="text-sm font-medium text-slate-300">AI Assistent:</span>
                </div>
                <Button variant="secondary" size="sm" onClick={() => { handleGenerateAi(); setAiChatMode(null); }} disabled={!messageToReplyTo || aiLoading}>
                    {aiLoading && !aiChatMode ? <Loader2 className="h-4 w-4 animate-spin" /> : "Auto-Antwort"}
                </Button>
                <Button variant={aiChatMode === 'create' ? 'primary' : 'secondary'} size="sm" onClick={() => setAiChatMode(aiChatMode === 'create' ? null : 'create')}>
                    Entwurf erstellen
                </Button>
                <Button variant={aiChatMode === 'edit' ? 'primary' : 'secondary'} size="sm" onClick={() => setAiChatMode(aiChatMode === 'edit' ? null : 'edit')} disabled={!composer.body}>
                    Text überarbeiten
                </Button>
            </div>

            {!openAiKey && (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-100">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                <p>Für die KI-Antwort benötigst du einen OpenAI-Key unter Einstellungen.</p>
              </div>
            )}
            {aiError && (
              <p className="mb-4 flex items-center gap-2 text-xs text-rose-300">
                <AlertTriangle className="h-3.5 w-3.5" /> {aiError}
              </p>
            )}
            
            {aiChatMode && (
              <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-4">
                <label className="text-xs uppercase tracking-[0.3em] text-slate-400">
                  {aiChatMode === "create" ? "Neue E-Mail erstellen" : "Entwurf überarbeiten"}
                </label>
                <div className="flex gap-2">
                  <Textarea
                    value={aiChatInput}
                    onChange={(e) => setAiChatInput(e.target.value)}
                    placeholder={aiChatMode === 'create' ? "Beschreibe, worum es in der E-Mail gehen soll..." : "Deine Anweisungen zur Überarbeitung..."}
                    rows={2}
                    className="flex-1"
                  />
                  <Button 
                    size="sm" 
                    onClick={() => {
                        if (aiChatMode === 'create') handleAiCreateWithPrompt(aiChatInput);
                        if (aiChatMode === 'edit') handleAiEditWithPrompt(aiChatInput);
                        setAiChatInput("");
                    }}
                    disabled={aiLoading}
                  >
                    {aiLoading && aiChatMode ? <Loader2 className="h-4 w-4 animate-spin" /> : "Go"}
                  </Button>
                </div>
              </div>
            )}
        </div>
      </div>
      </Modal>

      <Modal
        isOpen={drivePickerOpen}
        onClose={() => setDrivePickerOpen(false)}
        title="Drive-Datei anhängen"
        className="max-w-4xl"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-2 rounded-full bg-white/5 p-1">
              {(["ARCTO", "GOOGLE"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setDrivePickerSource(option)}
                  className={clsx(
                    "rounded-full px-4 py-1 text-xs font-semibold transition",
                    drivePickerSource === option ? "bg-white text-slate-900" : "text-slate-300 hover:bg-white/5",
                  )}
                >
                  {option === "ARCTO" ? "Arcto Drive" : "Google Drive"}
                </button>
              ))}
            </div>
            <div className="flex gap-2 rounded-full bg-white/5 p-1">
              {drivePickerSource === "ARCTO"
                ? (["USER", "TEAM"] as DriveScope[]).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setDrivePickerScope(option)}
                      className={clsx(
                        "rounded-full px-4 py-1 text-xs font-semibold transition",
                        drivePickerScope === option ? "bg-white text-slate-900" : "text-slate-300 hover:bg-white/5",
                      )}
                    >
                      {option === "USER" ? "Mein Drive" : "Team-Drive"}
                    </button>
                  ))
                : ([
                    { key: "my-drive", label: "Mein Drive" },
                    { key: "shared-drives", label: "Shared Drives" },
                  ] as const).map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setGooglePickerCollection(option.key)}
                      className={clsx(
                        "rounded-full px-4 py-1 text-xs font-semibold transition",
                        googlePickerCollection === option.key
                          ? "bg-white text-slate-900"
                          : "text-slate-300 hover:bg-white/5",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
            </div>
            <div className="relative flex-1 min-w-[200px]">
              <Input
                placeholder={drivePickerSource === "ARCTO" ? "Drive durchsuchen..." : "Google Drive durchsuchen..."}
                value={drivePickerSource === "ARCTO" ? drivePickerSearch : googlePickerSearch}
                onChange={(event) =>
                  drivePickerSource === "ARCTO"
                    ? setDrivePickerSearch(event.target.value)
                    : setGooglePickerSearch(event.target.value)
                }
                disabled={drivePickerSource === "GOOGLE" && !googlePickerStatus?.connected}
                className="w-full rounded-2xl border border-white/10 bg-slate-900/30 pl-9 pr-3 text-sm text-white"
              />
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (drivePickerSource === "ARCTO") {
                  void loadDrivePickerFiles();
                } else {
                  void loadGooglePickerFiles();
                }
              }}
              disabled={drivePickerSource === "ARCTO" ? drivePickerLoading : googlePickerLoading}
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Aktualisieren
            </Button>
          </div>

          {drivePickerSource === "GOOGLE" && googlePickerCollection === "shared-drives" && (
            <div className="flex flex-wrap items-center gap-3">
              <select
                className="min-w-[220px] rounded-full border border-white/10 bg-slate-900/30 px-3 py-2 text-sm text-white"
                value={googlePickerSharedDriveId ?? ""}
                onChange={(event) => setGooglePickerSharedDriveId(event.target.value || null)}
                disabled={googlePickerSharedLoading}
              >
                <option value="">Shared Drive auswählen</option>
                {googlePickerSharedDrives.map((drive) => (
                  <option key={drive.id} value={drive.id}>
                    {drive.name}
                  </option>
                ))}
              </select>
              {googlePickerSharedLoading && (
                <span className="text-xs text-slate-400">Shared Drives werden geladen ...</span>
              )}
            </div>
          )}

          {drivePickerSource === "GOOGLE" && (
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
              {googlePickerStatusLoading ? (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Status wird geladen ...
                </div>
              ) : googlePickerStatus?.connected ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">
                      {googlePickerStatus.displayName ?? "Google Konto"}
                    </p>
                    <p className="text-xs text-slate-400">{googlePickerStatus.email}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={handleGooglePickerDisconnect}>
                      Trennen
                    </Button>
                    <span className="text-xs text-slate-400">
                      Max. {googlePickerStatus.maxFileSizeMb} MB
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-slate-300">Google Drive ist nicht verbunden.</p>
                  <Button size="sm" onClick={handleGooglePickerConnect}>
                    Google Drive verbinden
                  </Button>
                </div>
              )}
            </div>
          )}

          {drivePickerSource === "GOOGLE" && googlePickerStatusError && (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {googlePickerStatusError}
            </div>
          )}
          {drivePickerSource === "ARCTO" && drivePickerError && (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {drivePickerError}
            </div>
          )}
          {drivePickerSource === "GOOGLE" && googlePickerError && (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {googlePickerError}
            </div>
          )}
          <div className="max-h-80 overflow-auto rounded-2xl border border-white/10">
            {drivePickerSource === "ARCTO" ? (
              drivePickerLoading ? (
                <div className="flex items-center justify-center gap-2 p-6 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Lade Dateien ...
                </div>
              ) : drivePickerFiles.length === 0 ? (
                <div className="p-6 text-sm text-slate-400">Keine Dateien gefunden.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-white/5 text-left text-xs uppercase tracking-widest text-slate-400">
                    <tr>
                      <th className="px-4 py-2">Name</th>
                      <th className="px-4 py-2">Größe</th>
                      <th className="px-4 py-2">Typ</th>
                      <th className="px-4 py-2 text-right">Aktion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drivePickerFiles.map((file) => (
                      <tr key={file.id} className="border-t border-white/5">
                        <td className="px-4 py-3 text-white">{file.name}</td>
                        <td className="px-4 py-3 text-slate-300">{formatSize(file.size)}</td>
                        <td className="px-4 py-3 text-slate-300">{file.mimeType}</td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            onClick={() => handleAttachDriveFile(file)}
                            disabled={driveAttachBusyId === file.id}
                          >
                            {driveAttachBusyId === file.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Anhängen"}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : !googlePickerStatus?.connected ? (
              <div className="p-6 text-sm text-slate-400">Bitte Google Drive verbinden.</div>
            ) : googlePickerCollection === "shared-drives" && !googlePickerSharedDriveId ? (
              <div className="p-6 text-sm text-slate-400">Bitte Shared Drive auswählen.</div>
            ) : googlePickerLoading ? (
              <div className="flex items-center justify-center gap-2 p-6 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Lade Dateien ...
              </div>
            ) : googlePickerFiles.length === 0 ? (
              <div className="p-6 text-sm text-slate-400">Keine Dateien gefunden.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-white/5 text-left text-xs uppercase tracking-widest text-slate-400">
                  <tr>
                    <th className="px-4 py-2">Name</th>
                    <th className="px-4 py-2">Größe</th>
                    <th className="px-4 py-2">Typ</th>
                    <th className="px-4 py-2">Quelle</th>
                    <th className="px-4 py-2 text-right">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {googlePickerFiles.map((file) => (
                    <tr key={file.id} className="border-t border-white/5">
                      <td className="px-4 py-3 text-white">{file.name}</td>
                      <td className="px-4 py-3 text-slate-300">{formatSize(file.size ?? 0)}</td>
                      <td className="px-4 py-3 text-slate-300">{file.mimeType}</td>
                      <td className="px-4 py-3 text-slate-300">
                        {googlePickerCollection === "shared-drives"
                          ? googlePickerSharedDriveName ?? "Shared Drive"
                          : "Mein Drive"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          onClick={() => handleAttachGoogleFile(file)}
                          disabled={googleAttachBusyId === file.id}
                        >
                          {googleAttachBusyId === file.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Anhängen"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {drivePickerSource === "GOOGLE" && googlePickerStatus?.connected && googlePickerFiles.length > 0 && (
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Seite {googlePickerPageIndex}</span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" disabled={!googlePickerCanPrev} onClick={handleGooglePickerPrevPage}>
                  Zurück
                </Button>
                <Button variant="ghost" size="sm" disabled={!googlePickerCanNext} onClick={handleGooglePickerNextPage}>
                  Weiter
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
