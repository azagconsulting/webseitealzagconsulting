"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Edit2, ExternalLink, Eye, LayoutGrid, List, Loader2, Plus, RefreshCw, Search, Trash2, Upload, X } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { buildApiUrl } from "@/lib/api";
import type { DriveFile, DriveFileListResponse, DriveFolder, DriveScope, GoogleDriveFile, GoogleDriveFileListResponse, GoogleDriveSharedDrive, GoogleDriveStatus } from "@/lib/types";

const initialPagination = { page: 1, limit: 20, totalItems: 0, totalPages: 1 };
const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
});

const formatSize = (value: number) => {
  if (!value || value <= 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let idx = 0;
  let size = value;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx += 1;
  }
  return `${idx === 0 ? size : size.toFixed(1)} ${units[idx]}`;
};

export default function DrivePage() {
  const { authorizedRequest, tokens } = useAuth();
  const searchParams = useSearchParams();
  const [driveView, setDriveView] = useState<"ARCTO" | "GOOGLE">("ARCTO");
  const [scope, setScope] = useState<DriveScope>("USER");
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [pagination, setPagination] = useState(initialPagination);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [previewFile, setPreviewFile] = useState<DriveFile | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [renameFile, setRenameFile] = useState<DriveFile | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameLoading, setRenameLoading] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteFile, setDeleteFile] = useState<DriveFile | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [folderLoading, setFolderLoading] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [folderBusy, setFolderBusy] = useState(false);
  const [folderModal, setFolderModal] = useState<null | "create" | "rename" | "delete">(null);
  const [folderNameValue, setFolderNameValue] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [googleStatus, setGoogleStatus] = useState<GoogleDriveStatus | null>(null);
  const [googleStatusLoading, setGoogleStatusLoading] = useState(false);
  const [googleStatusError, setGoogleStatusError] = useState<string | null>(null);
  const [googleFiles, setGoogleFiles] = useState<GoogleDriveFile[]>([]);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [googleSearch, setGoogleSearch] = useState("");
  const [googlePageToken, setGooglePageToken] = useState<string | null>(null);
  const [googleNextPageToken, setGoogleNextPageToken] = useState<string | null>(null);
  const [googlePageTokens, setGooglePageTokens] = useState<(string | null)[]>([]);
  const [googleCollection, setGoogleCollection] = useState<"my-drive" | "shared-drives">("my-drive");
  const [googleSharedDrives, setGoogleSharedDrives] = useState<GoogleDriveSharedDrive[]>([]);
  const [googleSharedDriveId, setGoogleSharedDriveId] = useState<string | null>(null);
  const [googleSharedLoading, setGoogleSharedLoading] = useState(false);
  const [googleDownloadBusy, setGoogleDownloadBusy] = useState<string | null>(null);

  const scopeLabel: Record<DriveScope, string> = {
    USER: "Mein Drive",
    TEAM: "Team-Drive",
  };
  const driveTabs = [
    { key: "USER", label: "Mein Drive" },
    { key: "TEAM", label: "Team-Drive" },
    { key: "GOOGLE", label: "Google Drive" },
  ] as const;

  useEffect(() => {
    const tab = searchParams?.get("tab");
    if (tab === "google") {
      setDriveView("GOOGLE");
    }
  }, [searchParams]);

  const loadFolders = useCallback(
    async (options?: { signal?: AbortSignal }) => {
      setFolderLoading(true);
      setFolderError(null);
      try {
        const params = new URLSearchParams();
        params.set("scope", scope);
        const data = await authorizedRequest<DriveFolder[]>(`/drive/folders?${params.toString()}`, {
          signal: options?.signal,
        });
        setFolders(data ?? []);
      } catch (err) {
        if (options?.signal?.aborted) return;
        setFolderError(err instanceof Error ? err.message : "Ordner konnten nicht geladen werden.");
      } finally {
        if (!options?.signal?.aborted) {
          setFolderLoading(false);
        }
      }
    },
    [authorizedRequest, scope],
  );

  const loadFiles = useCallback(
    async (options?: { signal?: AbortSignal }) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("scope", scope);
        params.set("page", String(page));
        params.set("limit", String(initialPagination.limit));
        if (search.trim()) {
          params.set("search", search.trim());
        }
        if (selectedFolderId) {
          params.set("folderId", selectedFolderId);
        }

        const data = await authorizedRequest<DriveFileListResponse>(
          `/drive/files?${params.toString()}`,
          { signal: options?.signal },
        );
        setFiles(data?.items ?? []);
        setPagination(data?.pagination ?? initialPagination);
      } catch (err) {
        if (options?.signal?.aborted) {
          return;
        }
        const message =
          err instanceof Error ? err.message : "Drive-Dateien konnten nicht geladen werden.";
        setError(message);
      } finally {
        if (!options?.signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [authorizedRequest, page, scope, search, selectedFolderId],
  );

  useEffect(() => {
    if (driveView !== "ARCTO") {
      return;
    }
    const controller = new AbortController();
    void loadFiles({ signal: controller.signal });
    return () => controller.abort();
  }, [driveView, loadFiles]);

  useEffect(() => {
    if (driveView !== "ARCTO") {
      return;
    }
    const controller = new AbortController();
    void loadFolders({ signal: controller.signal });
    return () => controller.abort();
  }, [driveView, loadFolders]);

  const handleScopeChange = (next: DriveScope) => {
    if (next === scope) return;
    setScope(next);
    setPage(1);
    setSelectedFolderId(null);
  };

  const handlePrimaryTabChange = (tab: "USER" | "TEAM" | "GOOGLE") => {
    if (tab === "GOOGLE") {
      setDriveView("GOOGLE");
      return;
    }
    setDriveView("ARCTO");
    handleScopeChange(tab as DriveScope);
  };

  const setSelectedUploadFile = (file: File | null) => {
    setUploadFile(file);
    if (file?.name) {
      setUploadName((current) => current || file.name);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSelectFile: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const nextFile = event.target.files?.[0] ?? null;
    setSelectedUploadFile(nextFile);
  };

  const handleDrop: React.DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    const nextFile = event.dataTransfer.files?.[0] ?? null;
    if (nextFile) {
      setSelectedUploadFile(nextFile);
    }
  };

  const loadGoogleStatus = useCallback(
    async (options?: { signal?: AbortSignal }) => {
      setGoogleStatusLoading(true);
      setGoogleStatusError(null);
      try {
        const data = await authorizedRequest<GoogleDriveStatus>("/drive/google/status", {
          signal: options?.signal,
        });
        setGoogleStatus(data ?? null);
      } catch (err) {
        if (options?.signal?.aborted) return;
        setGoogleStatusError(err instanceof Error ? err.message : "Google Drive Status konnte nicht geladen werden.");
      } finally {
        if (!options?.signal?.aborted) {
          setGoogleStatusLoading(false);
        }
      }
    },
    [authorizedRequest],
  );

  const loadGoogleSharedDrives = useCallback(
    async (options?: { signal?: AbortSignal }) => {
      setGoogleSharedLoading(true);
      try {
        const data = await authorizedRequest<GoogleDriveSharedDrive[]>("/drive/google/shared-drives", {
          signal: options?.signal,
        });
        const drives = data ?? [];
        setGoogleSharedDrives(drives);
        if (!googleSharedDriveId && drives.length > 0) {
          setGoogleSharedDriveId(drives[0].id);
        }
      } catch (err) {
        if (options?.signal?.aborted) return;
        setGoogleError(err instanceof Error ? err.message : "Shared Drives konnten nicht geladen werden.");
      } finally {
        if (!options?.signal?.aborted) {
          setGoogleSharedLoading(false);
        }
      }
    },
    [authorizedRequest, googleSharedDriveId],
  );

  const resetGooglePagination = useCallback(() => {
    setGooglePageToken(null);
    setGoogleNextPageToken(null);
    setGooglePageTokens([]);
  }, []);

  const loadGoogleFiles = useCallback(
    async (options?: { signal?: AbortSignal }) => {
      if (!googleStatus?.connected) {
        setGoogleFiles([]);
        setGoogleNextPageToken(null);
        return;
      }
      if (googleCollection === "shared-drives" && !googleSharedDriveId) {
        setGoogleFiles([]);
        setGoogleNextPageToken(null);
        return;
      }
      setGoogleLoading(true);
      setGoogleError(null);
      try {
        const params = new URLSearchParams();
        params.set("pageSize", "20");
        if (googleSearch.trim()) {
          params.set("search", googleSearch.trim());
        }
        if (googlePageToken) {
          params.set("pageToken", googlePageToken);
        }
        if (googleCollection === "shared-drives" && googleSharedDriveId) {
          params.set("driveId", googleSharedDriveId);
        }
        const data = await authorizedRequest<GoogleDriveFileListResponse>(
          `/drive/google/files?${params.toString()}`,
          { signal: options?.signal },
        );
        setGoogleFiles(data?.items ?? []);
        setGoogleNextPageToken(data?.nextPageToken ?? null);
      } catch (err) {
        if (options?.signal?.aborted) return;
        setGoogleError(err instanceof Error ? err.message : "Google Drive Dateien konnten nicht geladen werden.");
      } finally {
        if (!options?.signal?.aborted) {
          setGoogleLoading(false);
        }
      }
    },
    [authorizedRequest, googleCollection, googlePageToken, googleSearch, googleSharedDriveId, googleStatus?.connected],
  );

  useEffect(() => {
    if (driveView !== "GOOGLE") {
      return;
    }
    const controller = new AbortController();
    void loadGoogleStatus({ signal: controller.signal });
    return () => controller.abort();
  }, [driveView, loadGoogleStatus]);

  useEffect(() => {
    if (driveView !== "GOOGLE" || !googleStatus?.connected) {
      return;
    }
    const controller = new AbortController();
    void loadGoogleFiles({ signal: controller.signal });
    return () => controller.abort();
  }, [driveView, googleCollection, googlePageToken, googleSearch, googleSharedDriveId, googleStatus?.connected, loadGoogleFiles]);

  useEffect(() => {
    if (driveView !== "GOOGLE" || !googleStatus?.connected || googleCollection !== "shared-drives") {
      return;
    }
    const controller = new AbortController();
    void loadGoogleSharedDrives({ signal: controller.signal });
    return () => controller.abort();
  }, [driveView, googleCollection, googleStatus?.connected, loadGoogleSharedDrives]);

  useEffect(() => {
    if (driveView !== "GOOGLE") {
      return;
    }
    resetGooglePagination();
  }, [driveView, googleCollection, googleSearch, googleSharedDriveId, resetGooglePagination]);

  const handleGoogleConnect = useCallback(async () => {
    setGoogleStatusError(null);
    try {
      const data = await authorizedRequest<{ url: string }>(
        `/drive/google/auth-url?returnTo=${encodeURIComponent("/drive?tab=google")}`,
      );
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setGoogleStatusError(err instanceof Error ? err.message : "Google Drive Verbindung fehlgeschlagen.");
    }
  }, [authorizedRequest]);

  const handleGoogleDisconnect = useCallback(async () => {
    try {
      await authorizedRequest("/drive/google/disconnect", { method: "POST" });
      setGoogleFiles([]);
      resetGooglePagination();
      await loadGoogleStatus();
    } catch (err) {
      setGoogleStatusError(err instanceof Error ? err.message : "Google Drive konnte nicht getrennt werden.");
    }
  }, [authorizedRequest, loadGoogleStatus, resetGooglePagination]);

  const handleGoogleDownload = useCallback(
    async (file: GoogleDriveFile) => {
      const accessToken = tokens?.accessToken;
      if (!accessToken) {
        setGoogleError("Kein Zugriffstoken verfügbar. Bitte erneut anmelden.");
        return;
      }
      if (googleStatus?.maxFileSizeMb && file.size && file.size > googleStatus.maxFileSizeMb * 1024 * 1024) {
        setGoogleError(`Datei ist zu groß. Maximal ${googleStatus.maxFileSizeMb} MB erlaubt.`);
        return;
      }
      setGoogleDownloadBusy(file.id);
      setGoogleError(null);
      try {
        const params = new URLSearchParams();
        if (googleCollection === "shared-drives" && (file.driveId ?? googleSharedDriveId)) {
          params.set("driveId", file.driveId ?? googleSharedDriveId ?? "");
        }
        const response = await fetch(
          buildApiUrl(`/drive/google/files/${file.id}/download${params.toString() ? `?${params.toString()}` : ""}`),
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );
        if (!response.ok) {
          throw new Error("Download fehlgeschlagen.");
        }
        const blob = await response.blob();
        const header = response.headers.get("content-disposition");
        const utfName = header?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
        const plainName = header?.match(/filename=\"?([^\";]+)\"?/i)?.[1];
        const resolvedName = utfName ? decodeURIComponent(utfName) : plainName ?? file.name;
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = resolvedName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.URL.revokeObjectURL(url);
      } catch (err) {
        setGoogleError(err instanceof Error ? err.message : "Datei konnte nicht geladen werden.");
      } finally {
        setGoogleDownloadBusy(null);
      }
    },
    [googleCollection, googleSharedDriveId, googleStatus?.maxFileSizeMb, tokens?.accessToken],
  );

  const handleGoogleOpen = (file: GoogleDriveFile) => {
    if (file.webViewLink) {
      window.open(file.webViewLink, "_blank", "noopener,noreferrer");
      return;
    }
    void handleGoogleDownload(file);
  };

  const handleGoogleNextPage = () => {
    if (!googleNextPageToken) return;
    setGooglePageTokens((prev) => [...prev, googlePageToken]);
    setGooglePageToken(googleNextPageToken);
  };

  const handleGooglePrevPage = () => {
    if (!googleCanPrev) return;
    setGooglePageTokens((prev) => {
      const next = [...prev];
      const token = next.pop() ?? null;
      setGooglePageToken(token);
      return next;
    });
  };

  const activeTabKey = driveView === "GOOGLE" ? "GOOGLE" : scope;

  const refresh = () => {
    if (driveView === "GOOGLE") {
      void loadGoogleStatus();
      void loadGoogleFiles();
      if (googleCollection === "shared-drives") {
        void loadGoogleSharedDrives();
      }
      return;
    }
    void loadFiles();
    void loadFolders();
  };

  const handleUpload = useCallback(async () => {
    if (!uploadFile) {
      setError("Bitte wähle eine Datei aus.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const payload = new FormData();
      payload.set("scope", scope);
      if (uploadName.trim()) {
        payload.set("name", uploadName.trim());
      }
      if (selectedFolderId) {
        payload.set("folderId", selectedFolderId);
      }
      payload.append("file", uploadFile);
      await authorizedRequest<DriveFile>("/drive/files", { method: "POST", body: payload });
      setUploadFile(null);
      setUploadName("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      await loadFiles();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload fehlgeschlagen.";
      setError(message);
    } finally {
      setUploading(false);
    }
  }, [authorizedRequest, loadFiles, scope, uploadFile, uploadName, selectedFolderId]);

  const handleMoveFile = useCallback(
    async (file: DriveFile, folderId: string | null) => {
      try {
        await authorizedRequest(`/drive/files/${file.id}`, {
          method: "PATCH",
          body: JSON.stringify({ folderId }),
          headers: { "Content-Type": "application/json" },
        });
        await loadFiles();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Datei konnte nicht verschoben werden.");
      }
    },
    [authorizedRequest, loadFiles],
  );

  const handleDownload = useCallback(
    async (file: DriveFile) => {
      if (!tokens?.accessToken) {
        setError("Kein Zugriffstoken für Download verfügbar.");
        return;
      }
      try {
        const response = await fetch(buildApiUrl(`/drive/files/${file.id}/download`), {
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        if (!response.ok) {
          throw new Error("Download fehlgeschlagen.");
        }
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Download fehlgeschlagen.";
        setError(message);
      }
    },
    [tokens?.accessToken],
  );

  const handleCreateFolder = () => {
    setFolderNameValue("");
    setFolderModal("create");
  };

  const submitCreateFolder = useCallback(async () => {
    const name = folderNameValue.trim();
    if (!name) return;
    setFolderBusy(true);
    setFolderError(null);
    try {
      await authorizedRequest<DriveFolder>("/drive/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, scope }),
      });
      await loadFolders();
      setFolderModal(null);
      setFolderNameValue("");
    } catch (err) {
      setFolderError(err instanceof Error ? err.message : "Ordner konnte nicht erstellt werden.");
    } finally {
      setFolderBusy(false);
    }
  }, [authorizedRequest, folderNameValue, loadFolders, scope]);

  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    files.forEach((file) => {
      const id = file.folderId ?? "__none";
      counts[id] = (counts[id] ?? 0) + 1;
    });
    return counts;
  }, [files]);

  const handleRenameFolder = () => {
    if (!selectedFolderId) return;
    const current = folders.find((f) => f.id === selectedFolderId);
    setFolderNameValue(current?.name ?? "");
    setFolderModal("rename");
  };

  const submitRenameFolder = useCallback(async () => {
    if (!selectedFolderId) return;
    const name = folderNameValue.trim();
    if (!name) return;
    setFolderBusy(true);
    setFolderError(null);
    try {
      await authorizedRequest(`/drive/folders/${selectedFolderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      await loadFolders();
      setFolderModal(null);
      setFolderNameValue("");
    } catch (err) {
      setFolderError(err instanceof Error ? err.message : "Ordner konnte nicht umbenannt werden.");
    } finally {
      setFolderBusy(false);
    }
  }, [authorizedRequest, folderNameValue, loadFolders, selectedFolderId]);

  const handleDeleteFolder = () => {
    if (!selectedFolderId) return;
    setFolderModal("delete");
  };

  const submitDeleteFolder = useCallback(async () => {
    if (!selectedFolderId) return;
    setFolderBusy(true);
    setFolderError(null);
    try {
      await authorizedRequest(`/drive/folders/${selectedFolderId}`, { method: "DELETE" });
      setSelectedFolderId(null);
      await loadFolders();
      await loadFiles();
      setFolderModal(null);
    } catch (err) {
      setFolderError(err instanceof Error ? err.message : "Ordner konnte nicht gelöscht werden.");
    } finally {
      setFolderBusy(false);
    }
  }, [authorizedRequest, loadFiles, loadFolders, selectedFolderId]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handlePreview = useCallback(
    async (file: DriveFile) => {
      setPreviewFile(file);
      setPreviewLoading(true);
      setPreviewError(null);
      setPreviewUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return null;
      });

      if (!tokens?.accessToken) {
        setPreviewError("Kein Zugriffstoken verfügbar.");
        setPreviewLoading(false);
        return;
      }

      try {
        const response = await fetch(buildApiUrl(`/drive/files/${file.id}/download`), {
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        if (!response.ok) {
          throw new Error("Vorschau konnte nicht geladen werden.");
        }
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      } catch (err) {
        setPreviewError(
          err instanceof Error ? err.message : "Vorschau konnte nicht geladen werden.",
        );
      } finally {
        setPreviewLoading(false);
      }
    },
    [tokens?.accessToken],
  );

  const closePreview = useCallback(() => {
    setPreviewFile(null);
    setPreviewLoading(false);
    setPreviewError(null);
    setPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
  }, []);

  const requestDelete = useCallback((file: DriveFile) => {
    setDeleteFile(file);
    setDeleteError(null);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteFile) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await authorizedRequest(`/drive/files/${deleteFile.id}`, { method: "DELETE" });
      await loadFiles();
      setDeleteFile(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Löschen fehlgeschlagen.";
      setDeleteError(message);
    } finally {
      setDeleteLoading(false);
    }
  }, [authorizedRequest, deleteFile, loadFiles]);

  const requestRename = useCallback((file: DriveFile) => {
    setRenameFile(file);
    setRenameValue(file.name);
    setRenameError(null);
  }, []);

  const submitRename = useCallback(async () => {
    if (!renameFile) {
      return;
    }
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === renameFile.name) {
      setRenameFile(null);
      return;
    }
    setRenameLoading(true);
    setRenameError(null);
    try {
      await authorizedRequest<DriveFile>(`/drive/files/${renameFile.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: trimmed }),
      });
      await loadFiles();
      setRenameFile(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Umbenennen fehlgeschlagen.";
      setRenameError(message);
    } finally {
      setRenameLoading(false);
    }
  }, [authorizedRequest, loadFiles, renameFile, renameValue]);

  const closeRename = () => {
    setRenameFile(null);
    setRenameError(null);
    setRenameLoading(false);
  };

  const closeDelete = () => {
    setDeleteFile(null);
    setDeleteError(null);
    setDeleteLoading(false);
  };

  const totalPages = pagination.totalPages ?? 1;
  const canPrev = page > 1;
  const canNext = page < totalPages;
  const googlePageIndex = googlePageTokens.length + 1;
  const googleCanPrev = googlePageTokens.length > 0;
  const googleCanNext = Boolean(googleNextPageToken);
  const googleSharedDriveName = googleSharedDrives.find((drive) => drive.id === googleSharedDriveId)?.name;

  const emptyColSpan = scope === "TEAM" ? 8 : 7;
  const isPreviewImage = previewFile?.mimeType?.startsWith("image/") ?? false;
  const isPreviewPdf = previewFile?.mimeType?.toLowerCase().includes("pdf") ?? false;
  const closeFolderModal = () => {
    setFolderModal(null);
    setFolderNameValue("");
  };

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-white">Drive</h1>
        <p className="text-sm text-slate-400">
          Dateien sicher hochladen, organisieren und im Team teilen. Persönliche und gemeinsame Bereiche
          bleiben strikt getrennt.
        </p>
      </header>

      {driveView === "ARCTO" && error && (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}
      {driveView === "GOOGLE" && googleError && (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {googleError}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
        {driveView === "ARCTO" && (
        <Card className="p-0">
          <div className="flex items-center justify-between gap-3 border-b border-white/5 px-5 py-4">
            <div>
              <p className="text-lg font-semibold text-white">Ordner</p>
              <p className="text-sm text-slate-400">Strukturiere dein Drive und halte Dateien übersichtlich.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void loadFolders()}
                disabled={folderLoading}
                className="rounded-full border border-white/10 bg-white/5"
                aria-label="Ordner neu laden"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCreateFolder}
                disabled={folderBusy}
                className="rounded-full border border-white/10 bg-white/5"
                aria-label="Ordner anlegen"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRenameFolder}
                disabled={!selectedFolderId || folderBusy}
                className="rounded-full border border-white/10 bg-white/5"
                aria-label="Ordner umbenennen"
              >
                <Edit2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleDeleteFolder}
                disabled={!selectedFolderId || folderBusy}
                className="rounded-full border border-white/10 bg-rose-500/10 text-rose-100"
                aria-label="Ordner löschen"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-3 p-5">
            {folderError && (
              <p className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                {folderError}
              </p>
            )}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedFolderId(null);
                  setPage(1);
                }}
                className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                  selectedFolderId === null
                    ? "border-sky-400/40 bg-sky-500/10 text-white shadow-[0_0_0_1px_rgba(14,165,233,0.3)]"
                    : "border-white/5 bg-white/5 text-slate-200 hover:border-white/10 hover:bg-white/10"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-sky-400/80" />
                    <span className="text-sm font-semibold">Alle Dateien</span>
                  </div>
                  <span className="rounded-full bg-white/10 px-2 py-1 text-xs text-slate-200">
                    {pagination.totalItems ?? files.length}
                  </span>
                </div>
                <p className="text-xs text-slate-400">Gesamter Bereich ({scopeLabel[scope]})</p>
              </button>

              {folderLoading && (
                <p className="px-1 py-2 text-xs text-slate-400">
                  <Loader2 className="mr-2 inline-block h-3.5 w-3.5 animate-spin" />
                  Ordner werden geladen ...
                </p>
              )}

              {!folderLoading && folders.length > 0 && (
                <div className="space-y-2">
                  {folders.map((folder) => {
                    const active = selectedFolderId === folder.id;
                    const count =
                      selectedFolderId && selectedFolderId !== folder.id
                        ? null
                        : selectedFolderId === folder.id
                          ? pagination.totalItems ?? files.length
                          : folderCounts[folder.id] ?? 0;
                    return (
                      <button
                        key={folder.id}
                        type="button"
                        onClick={() => {
                          setSelectedFolderId(folder.id);
                          setPage(1);
                        }}
                        className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                          active
                            ? "border-sky-400/40 bg-sky-500/10 text-white shadow-[0_0_0_1px_rgba(14,165,233,0.3)]"
                            : "border-white/5 bg-white/5 text-slate-200 hover:border-white/10 hover:bg-white/10"
                        }`}
                      >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full bg-white/40" />
                              <span className="text-sm font-semibold">{folder.name}</span>
                            </div>
                            <span className="rounded-full bg-white/10 px-2 py-1 text-xs text-slate-200">
                            {count ?? "—"}
                            </span>
                          </div>
                        <p className="text-xs text-slate-400">
                          Erstellt am {dateFormatter.format(new Date(folder.createdAt))}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}

              {!folderLoading && folders.length === 0 && (
                <p className="px-1 py-2 text-xs text-slate-400">Noch keine Ordner vorhanden.</p>
              )}
            </div>
          </div>
        </Card>
        )}

        {driveView === "GOOGLE" && (
        <Card className="p-0">
          <div className="flex items-center justify-between gap-3 border-b border-white/5 px-5 py-4">
            <div>
              <p className="text-lg font-semibold text-white">Google Drive</p>
              <p className="text-sm text-slate-400">Verbinde dein Google-Konto und nutze Shared Drives.</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void loadGoogleStatus()}
              disabled={googleStatusLoading}
              className="rounded-full border border-white/10 bg-white/5"
              aria-label="Google Drive Status neu laden"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-4 p-5">
            {googleStatusError && (
              <p className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                {googleStatusError}
              </p>
            )}
            {googleStatusLoading ? (
              <p className="px-1 py-2 text-xs text-slate-400">
                <Loader2 className="mr-2 inline-block h-3.5 w-3.5 animate-spin" />
                Status wird geladen ...
              </p>
            ) : googleStatus?.connected ? (
              <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-sm text-slate-200">
                  <p className="font-semibold text-white">{googleStatus.displayName ?? "Google Konto"}</p>
                  <p className="text-xs text-slate-400">{googleStatus.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={handleGoogleDisconnect}>
                    Verbindung trennen
                  </Button>
                  <span className="text-xs text-slate-400">
                    Max. Datei: {googleStatus.maxFileSizeMb} MB
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-sm text-slate-300">
                  Google Drive ist noch nicht verbunden.
                </p>
                <Button size="sm" onClick={handleGoogleConnect}>
                  Google Drive verbinden
                </Button>
              </div>
            )}

            {googleStatus?.connected && (
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-widest text-slate-400">Quelle</p>
                <div className="flex gap-2 rounded-full bg-white/5 p-1">
                  {[
                    { key: "my-drive", label: "Mein Drive" },
                    { key: "shared-drives", label: "Shared Drives" },
                  ].map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setGoogleCollection(option.key as "my-drive" | "shared-drives")}
                      className={`rounded-full px-4 py-1 text-xs font-semibold transition ${
                        googleCollection === option.key
                          ? "bg-white text-slate-900"
                          : "text-slate-300 hover:bg-white/5"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {googleCollection === "shared-drives" && (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-400">Shared Drive auswählen</p>
                    <select
                      className="w-full rounded-full border border-white/10 bg-slate-900/50 px-3 py-2 text-sm text-white"
                      value={googleSharedDriveId ?? ""}
                      onChange={(event) => setGoogleSharedDriveId(event.target.value || null)}
                      disabled={googleSharedLoading}
                    >
                      <option value="">Bitte wählen</option>
                      {googleSharedDrives.map((drive) => (
                        <option key={drive.id} value={drive.id}>
                          {drive.name}
                        </option>
                      ))}
                    </select>
                    {googleSharedLoading && (
                      <p className="text-xs text-slate-400">Shared Drives werden geladen ...</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
        )}

        <Card className="p-0">
          <div className="space-y-4 border-b border-white/5 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {driveTabs.map((tab) => {
                  const active = activeTabKey === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => handlePrimaryTabChange(tab.key)}
                      className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                        active ? "bg-white text-slate-900 shadow" : "bg-slate-900/60 text-slate-200 hover:bg-slate-900"
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={viewMode === "table" ? "secondary" : "ghost"}
                  size="icon"
                  onClick={() => setViewMode("table")}
                  className="rounded-full"
                  aria-label="Tabellen-Ansicht"
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "grid" ? "secondary" : "ghost"}
                  size="icon"
                  onClick={() => setViewMode("grid")}
                  className="rounded-full"
                  aria-label="Kachel-Ansicht"
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {driveView === "ARCTO" ? (
                <>
                  <div className="relative min-w-[220px] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <Input
                      className="w-full rounded-2xl border border-white/10 bg-slate-900/50 pl-9 pr-9 text-sm text-white placeholder:text-slate-500"
                      placeholder="Dateien durchsuchen"
                      value={search}
                      onChange={(event) => {
                        setPage(1);
                        setSearch(event.target.value);
                      }}
                    />
                    {search && (
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-500 hover:text-white"
                        onClick={() => {
                          setSearch("");
                          setPage(1);
                        }}
                        aria-label="Suche löschen"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <Input
                    placeholder="Name (optional)"
                    value={uploadName}
                    onChange={(event) => setUploadName(event.target.value)}
                    className="w-48 rounded-full border border-white/10 bg-slate-900/50 text-sm text-white placeholder:text-slate-500"
                  />
                  <input type="file" ref={fileInputRef} className="hidden" onChange={handleSelectFile} />
                  <div
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={handleDrop}
                    className="flex min-w-[220px] items-center gap-3 rounded-xl border border-dashed border-white/15 bg-slate-900/50 px-4 py-2 text-xs text-slate-300"
                  >
                    <Button
                      variant="secondary"
                      size="sm"
                      className="cursor-pointer rounded-full px-4"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-4 w-4" /> Datei wählen
                    </Button>
                    <span className="hidden text-slate-400 sm:inline">oder hier ablegen</span>
                    {uploadFile && (
                      <span className="truncate text-slate-200" title={uploadFile.name}>
                        {uploadFile.name}
                      </span>
                    )}
                  </div>
                  <Button
                    onClick={handleUpload}
                    disabled={uploading || !uploadFile}
                    className="cursor-pointer rounded-full px-4"
                  >
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    Hochladen
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={refresh}
                    disabled={loading}
                    className="rounded-full border border-white/10"
                    aria-label="Aktualisieren"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <div className="relative min-w-[220px] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <Input
                      className="w-full rounded-2xl border border-white/10 bg-slate-900/50 pl-9 pr-9 text-sm text-white placeholder:text-slate-500"
                      placeholder="Google Drive durchsuchen"
                      value={googleSearch}
                      onChange={(event) => setGoogleSearch(event.target.value)}
                      disabled={!googleStatus?.connected}
                    />
                    {googleSearch && (
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-500 hover:text-white"
                        onClick={() => setGoogleSearch("")}
                        aria-label="Suche löschen"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    {googleStatus?.connected
                      ? `${googleCollection === "shared-drives" ? googleSharedDriveName ?? "Shared Drive" : "Mein Drive"}`
                      : "Bitte Google Drive verbinden"}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={refresh}
                    disabled={googleLoading || googleStatusLoading}
                    className="rounded-full border border-white/10"
                    aria-label="Aktualisieren"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="p-5">
            {driveView === "ARCTO" ? (
              <>
                {viewMode === "table" ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="text-left text-xs uppercase tracking-widest text-slate-400">
                    <tr>
                      <th className="py-2">Name</th>
                      <th className="py-2">Größe</th>
                      <th className="py-2">Typ</th>
                      <th className="py-2">Ordner</th>
                      <th className="py-2">Uploader</th>
                      {scope === "TEAM" && <th className="py-2">Team</th>}
                      <th className="py-2">Erstellt</th>
                      <th className="py-2 text-right">Aktionen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((file) => (
                      <tr key={file.id} className="border-t border-white/5">
                        <td className="py-3 pr-4">
                          <button
                            type="button"
                            className="cursor-pointer text-left font-semibold text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                            onClick={() => handlePreview(file)}
                          >
                            {file.name}
                          </button>
                          <p className="text-xs text-slate-400">
                            {file.scope === "USER" ? "Mein Drive" : "Team-Drive"}
                          </p>
                        </td>
                        <td className="py-3 pr-4 text-slate-200">{formatSize(file.size)}</td>
                        <td className="py-3 pr-4 text-slate-200">{file.mimeType}</td>
                        <td className="py-3 pr-4 text-slate-200">
                          {file.folderId ? folders.find((f) => f.id === file.folderId)?.name ?? "—" : "—"}
                        </td>
                        <td className="py-3 pr-4 text-slate-200">{file.uploadedBy.displayName}</td>
                        {scope === "TEAM" && (
                          <td className="py-3 pr-4 text-slate-200">{file.team?.name ?? "Workspace"}</td>
                        )}
                        <td className="py-3 pr-4 text-slate-200">
                          {dateFormatter.format(new Date(file.createdAt))}
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <select
                              className="rounded-full border border-white/10 bg-slate-900/50 px-2 py-1 text-xs text-white"
                              value={file.folderId ?? ""}
                              onChange={(e) => handleMoveFile(file, e.target.value || null)}
                            >
                              <option value="">Kein Ordner</option>
                              {folders.map((folder) => (
                                <option key={folder.id} value={folder.id}>
                                  {folder.name}
                                </option>
                              ))}
                            </select>
                            <Button variant="ghost" size="sm" className="cursor-pointer" onClick={() => handlePreview(file)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="cursor-pointer" onClick={() => handleDownload(file)}>
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="cursor-pointer" onClick={() => requestRename(file)}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="cursor-pointer" onClick={() => requestDelete(file)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!files.length && !loading && (
                      <tr>
                        <td colSpan={emptyColSpan} className="py-6 text-center text-slate-400">
                          Noch keine Dateien vorhanden.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {files.map((file) => {
                  const folderName = file.folderId
                    ? folders.find((f) => f.id === file.folderId)?.name ?? "—"
                    : "—";
                  return (
                    <div
                      key={file.id}
                      className="rounded-2xl border border-white/5 bg-white/5 p-4 shadow-sm transition hover:border-white/10 hover:bg-white/10"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <button
                            type="button"
                            className="text-left text-base font-semibold text-white hover:underline"
                            onClick={() => handlePreview(file)}
                          >
                            {file.name}
                          </button>
                          <p className="text-xs text-slate-400">
                            {file.scope === "USER" ? "Mein Drive" : "Team-Drive"} • {folderName}
                          </p>
                        </div>
                        <select
                          className="rounded-full border border-white/10 bg-slate-900/60 px-2 py-1 text-xs text-white"
                          value={file.folderId ?? ""}
                          onChange={(e) => handleMoveFile(file, e.target.value || null)}
                        >
                          <option value="">Kein Ordner</option>
                          {folders.map((folder) => (
                            <option key={folder.id} value={folder.id}>
                              {folder.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                        <span>{formatSize(file.size)}</span>
                        <span>{dateFormatter.format(new Date(file.createdAt))}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button variant="ghost" size="sm" className="cursor-pointer" onClick={() => handlePreview(file)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="cursor-pointer" onClick={() => handleDownload(file)}>
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="cursor-pointer" onClick={() => requestRename(file)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="cursor-pointer" onClick={() => requestDelete(file)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {!files.length && !loading && (
                  <div className="col-span-full rounded-2xl border border-white/5 bg-white/5 px-4 py-6 text-center text-slate-400">
                    Noch keine Dateien vorhanden.
                  </div>
                )}
              </div>
            )}

            {loading && (
              <div className="mt-4 flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Dateien werden geladen ...
              </div>
            )}

            <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
              <span>
                Seite {pagination.page} von {pagination.totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!canPrev}
                  onClick={() => canPrev && setPage((prev) => prev - 1)}
                >
                  Zurück
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!canNext}
                  onClick={() => canNext && setPage((prev) => prev + 1)}
                >
                  Weiter
                </Button>
              </div>
            </div>
              </>
            ) : (
              <>
                {!googleStatus?.connected ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-center text-slate-400">
                    Bitte Google Drive verbinden, um Dateien zu sehen.
                  </div>
                ) : googleCollection === "shared-drives" && !googleSharedDriveId ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-center text-slate-400">
                    Bitte wähle einen Shared Drive aus.
                  </div>
                ) : (
                  <>
                    {viewMode === "table" ? (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] text-sm">
                          <thead className="text-left text-xs uppercase tracking-widest text-slate-400">
                            <tr>
                              <th className="py-2">Name</th>
                              <th className="py-2">Größe</th>
                              <th className="py-2">Typ</th>
                              <th className="py-2">Quelle</th>
                              <th className="py-2">Geändert</th>
                              <th className="py-2 text-right">Aktionen</th>
                            </tr>
                          </thead>
                          <tbody>
                            {googleFiles.map((file) => (
                              <tr key={file.id} className="border-t border-white/5">
                                <td className="py-3 pr-4">
                                  <button
                                    type="button"
                                    className="cursor-pointer text-left font-semibold text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                                    onClick={() => handleGoogleOpen(file)}
                                  >
                                    {file.name}
                                  </button>
                                  <p className="text-xs text-slate-400">
                                    {googleCollection === "shared-drives"
                                      ? googleSharedDriveName ?? "Shared Drive"
                                      : "Mein Drive"}
                                  </p>
                                </td>
                                <td className="py-3 pr-4 text-slate-200">{formatSize(file.size ?? 0)}</td>
                                <td className="py-3 pr-4 text-slate-200">{file.mimeType}</td>
                                <td className="py-3 pr-4 text-slate-200">
                                  {googleCollection === "shared-drives"
                                    ? googleSharedDriveName ?? "Shared Drive"
                                    : "Mein Drive"}
                                </td>
                                <td className="py-3 pr-4 text-slate-200">
                                  {file.modifiedTime ? dateFormatter.format(new Date(file.modifiedTime)) : "-"}
                                </td>
                                <td className="py-3 text-right">
                                  <div className="flex flex-wrap items-center justify-end gap-2">
                                    <Button variant="ghost" size="sm" className="cursor-pointer" onClick={() => handleGoogleOpen(file)}>
                                      <ExternalLink className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="cursor-pointer"
                                      onClick={() => handleGoogleDownload(file)}
                                      disabled={googleDownloadBusy === file.id}
                                    >
                                      {googleDownloadBusy === file.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                            {!googleFiles.length && !googleLoading && (
                              <tr>
                                <td colSpan={6} className="py-6 text-center text-slate-400">
                                  Keine Dateien gefunden.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {googleFiles.map((file) => (
                          <div
                            key={file.id}
                            className="rounded-2xl border border-white/5 bg-white/5 p-4 shadow-sm transition hover:border-white/10 hover:bg-white/10"
                          >
                            <div className="space-y-1">
                              <button
                                type="button"
                                className="text-left text-base font-semibold text-white hover:underline"
                                onClick={() => handleGoogleOpen(file)}
                              >
                                {file.name}
                              </button>
                              <p className="text-xs text-slate-400">
                                {googleCollection === "shared-drives"
                                  ? googleSharedDriveName ?? "Shared Drive"
                                  : "Mein Drive"}
                              </p>
                            </div>
                            <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                              <span>{formatSize(file.size ?? 0)}</span>
                              <span>
                                {file.modifiedTime ? dateFormatter.format(new Date(file.modifiedTime)) : "-"}
                              </span>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <Button variant="ghost" size="sm" className="cursor-pointer" onClick={() => handleGoogleOpen(file)}>
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="cursor-pointer"
                                onClick={() => handleGoogleDownload(file)}
                                disabled={googleDownloadBusy === file.id}
                              >
                                {googleDownloadBusy === file.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                              </Button>
                            </div>
                          </div>
                        ))}
                        {!googleFiles.length && !googleLoading && (
                          <div className="col-span-full rounded-2xl border border-white/5 bg-white/5 px-4 py-6 text-center text-slate-400">
                            Keine Dateien gefunden.
                          </div>
                        )}
                      </div>
                    )}

                    {googleLoading && (
                      <div className="mt-4 flex items-center gap-2 text-sm text-slate-400">
                        <Loader2 className="h-4 w-4 animate-spin" /> Dateien werden geladen ...
                      </div>
                    )}

                    <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                      <span>Seite {googlePageIndex}</span>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" disabled={!googleCanPrev} onClick={handleGooglePrevPage}>
                          Zurück
                        </Button>
                        <Button variant="ghost" size="sm" disabled={!googleCanNext} onClick={handleGoogleNextPage}>
                          Weiter
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </Card>
      </div>

      <Modal
        isOpen={folderModal === "create"}
        onClose={closeFolderModal}
        title="Ordner anlegen"
        className="max-w-md"
      >
        <div className="space-y-4">
          <Input
            autoFocus
            placeholder="Ordnername"
            value={folderNameValue}
            onChange={(event) => setFolderNameValue(event.target.value)}
            disabled={folderBusy}
          />
          {folderError && (
            <p className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {folderError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeFolderModal} className="cursor-pointer">
              Abbrechen
            </Button>
            <Button
              onClick={submitCreateFolder}
              disabled={folderBusy || !folderNameValue.trim()}
              className="cursor-pointer"
            >
              {folderBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Erstellen"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={folderModal === "rename"}
        onClose={closeFolderModal}
        title="Ordner umbenennen"
        className="max-w-md"
      >
        <div className="space-y-4">
          <Input
            autoFocus
            placeholder="Neuer Ordnername"
            value={folderNameValue}
            onChange={(event) => setFolderNameValue(event.target.value)}
            disabled={folderBusy}
          />
          {folderError && (
            <p className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {folderError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeFolderModal} className="cursor-pointer">
              Abbrechen
            </Button>
            <Button
              onClick={submitRenameFolder}
              disabled={folderBusy || !folderNameValue.trim()}
              className="cursor-pointer"
            >
              {folderBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Speichern"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={folderModal === "delete"}
        onClose={closeFolderModal}
        title="Ordner löschen"
        className="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-300">
            Möchtest du den Ordner inklusive Zuordnungen entfernen? Dateien bleiben erhalten, verlieren aber
            die Ordnerzuweisung.
          </p>
          {folderError && (
            <p className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {folderError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeFolderModal} className="cursor-pointer">
              Abbrechen
            </Button>
            <Button
              variant="secondary"
              onClick={submitDeleteFolder}
              disabled={folderBusy}
              className="cursor-pointer bg-rose-500/80 text-white hover:bg-rose-500"
            >
              {folderBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Löschen"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(previewFile)}
        onClose={closePreview}
        title={previewFile?.name}
        className="max-w-4xl"
      >
        {previewLoading && (
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin" /> Vorschau wird geladen ...
          </div>
        )}

        {!previewLoading && previewError && (
          <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {previewError}
          </div>
        )}

        {!previewLoading && previewUrl && isPreviewImage && (
          <div className="max-h-[70vh] overflow-auto">
            <img src={previewUrl} alt={previewFile?.name} className="max-h-[70vh] w-full rounded-xl object-contain" />
          </div>
        )}

        {!previewLoading && previewUrl && isPreviewPdf && (
          <iframe
            src={previewUrl}
            title={previewFile?.name}
            className="h-[70vh] w-full rounded-xl border border-white/5"
          />
        )}

        {!previewLoading && previewUrl && !isPreviewImage && !isPreviewPdf && (
          <div className="space-y-3 text-sm text-slate-300">
            <p>Für diesen Dateityp steht keine Vorschau zur Verfügung.</p>
            {previewFile && (
              <Button variant="secondary" size="sm" onClick={() => handleDownload(previewFile)}>
                <Download className="h-4 w-4" /> Datei herunterladen
              </Button>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={Boolean(renameFile)}
        onClose={closeRename}
        title="Datei umbenennen"
        className="max-w-lg"
      >
        <div className="space-y-4">
          <Input
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            placeholder="Neuer Dateiname"
          />
          {renameError && (
            <p className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {renameError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeRename} className="cursor-pointer">
              Abbrechen
            </Button>
            <Button
              onClick={submitRename}
              disabled={renameLoading || !renameValue.trim()}
              className="cursor-pointer"
            >
              {renameLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Speichern"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(deleteFile)}
        onClose={closeDelete}
        title="Datei löschen"
        className="max-w-lg"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-300">
            Möchtest du die Datei <span className="font-semibold text-white">{deleteFile?.name}</span> endgültig
            löschen? Diese Aktion kann nicht rückgängig gemacht werden.
          </p>
          {deleteError && (
            <p className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {deleteError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeDelete} className="cursor-pointer">
              Abbrechen
            </Button>
            <Button
              variant="secondary"
              onClick={confirmDelete}
              disabled={deleteLoading}
              className="cursor-pointer bg-rose-500/80 text-white hover:bg-rose-500"
            >
              {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Löschen"}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
