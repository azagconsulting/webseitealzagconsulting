"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Clock3,
  EllipsisVertical,
  FileText,
  FolderOpen,
  Loader2,
  Mail,
  MapPin,
  Package,
  Pencil,
  Phone,
  PlusCircle,
  Search,
  Trash2,
  Upload,
  UserPlus,
} from "lucide-react";
import { clsx } from "clsx";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import type {
  Customer,
  CustomerContact,
  CustomerListResponse,
  CustomerPackage,
  CustomerPackageService,
  CustomerType,
  DriveFile,
  DriveFileListResponse,
  DriveFolder,
  InviteCustomerPortalUserResponse,
  ServiceOrderStatus,
} from "@/lib/types";
import { CustomerModal } from "./customer-modal";
import { ComposerModal } from "../workspace/messages/composer-modal";

const typeFilters: { label: string; value: "all" | CustomerType }[] = [
  { label: "Alle", value: "all" },
  { label: "B2C", value: "PRIVATE" },
  { label: "B2B", value: "BUSINESS" },
  { label: "Enterprise", value: "FLEET" },
];

const customerPackageOptions: Array<{
  value: CustomerPackage;
  label: string;
  description: string;
  accentClassName: string;
  services: Array<{
    title: string;
    description: string;
  }>;
}> = [
  {
    value: "STARTER",
    label: "Starter",
    description: "Basis-Funktionen für laufende Betreuung.",
    accentClassName: "from-cyan-500/30 to-slate-900/40 border-cyan-300/40",
    services: [
      {
        title: "Onboarding & Setup",
        description: "Technisches Setup und gemeinsamer Start-Call.",
      },
      {
        title: "Monatliches Reporting",
        description: "Leistungsbericht mit nächsten empfohlenen Schritten.",
      },
    ],
  },
  {
    value: "GROWTH",
    label: "Growth",
    description: "Erweiterte Automationen und mehr Support.",
    accentClassName: "from-emerald-500/30 to-slate-900/40 border-emerald-300/40",
    services: [
      {
        title: "Automations-Optimierung",
        description: "Kontinuierliche Optimierung von Workflows und Funnel.",
      },
      {
        title: "Strategie-Sparring",
        description: "Regelmäßige Abstimmung zu KPIs und Prioritäten.",
      },
    ],
  },
  {
    value: "ENTERPRISE",
    label: "Enterprise",
    description: "Individuelle Integrationen und Priorität.",
    accentClassName: "from-amber-500/30 to-slate-900/40 border-amber-300/40",
    services: [
      {
        title: "Individuelle Integrationen",
        description: "Schnittstellen und individuelle Prozessanpassungen.",
      },
      {
        title: "Priorisierter Support",
        description: "Bevorzugte Bearbeitung mit dediziertem Ansprechpartner.",
      },
    ],
  },
];

function formatCustomerPackage(value: CustomerPackage) {
  const option = customerPackageOptions.find((entry) => entry.value === value);
  return option?.label ?? value;
}

function createPackageServiceId() {
  return `service-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function buildPackageServicesFromTemplate(value: CustomerPackage): CustomerPackageService[] {
  const option = customerPackageOptions.find((entry) => entry.value === value);
  if (!option) {
    return [];
  }
  return option.services.map((service, index) => ({
    id: `${value.toLowerCase()}-service-${index + 1}`,
    title: service.title,
    description: service.description,
  }));
}

function normalizePackageServices(services: CustomerPackageService[]): CustomerPackageService[] {
  return services
    .map((service) => ({
      id: service.id?.trim() || createPackageServiceId(),
      title: service.title.trim(),
      description: service.description?.trim() || null,
    }))
    .filter((service) => service.title.length > 0);
}

const pipelineStageOptions: { label: string; value: ServiceOrderStatus; hint: string }[] = [
  { label: "Lead", value: "PLANNED", hint: "Neuer Kontakt oder Erstgespräch" },
  { label: "In Arbeit", value: "IN_SERVICE", hint: "Angebot, Strategie oder Verhandlung" },
  { label: "Gewonnen", value: "COMPLETED", hint: "Deal/Projekt bestätigt" },
  { label: "Verloren", value: "CANCELLED", hint: "Kein Abschluss" },
];

const ACTIVITY_PREFIX = "@activity|";

const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
});

type PipelineFormState = {
  title: string;
  stage: ServiceOrderStatus;
  owner: string;
  objective: string;
  expectedValue: string;
  closedValue: string;
  followUpAt: string;
  lastStep: string;
};

const initialPipelineForm: PipelineFormState = {
  title: "",
  stage: "PLANNED",
  owner: "",
  objective: "",
  expectedValue: "",
  closedValue: "",
  followUpAt: "",
  lastStep: "",
};

function formatDate(value?: string | null) {
  if (!value) return "–";
  return dateFormatter.format(new Date(value));
}

function formatEuro(cents?: number | null) {
  if (cents == null) {
    return "–";
  }
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function parseEuroToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/[\s€]/g, "").replace(",", ".");
  const parsed = Number(normalized);
  if (Number.isNaN(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

function formatCustomerType(type: CustomerType) {
  if (type === "PRIVATE") return "B2C";
  if (type === "BUSINESS") return "B2B";
  return "Enterprise";
}

function getStageMeta(stage: ServiceOrderStatus) {
  const option = pipelineStageOptions.find((entry) => entry.value === stage);
  return option ?? pipelineStageOptions[0];
}

function getCurrentStage(customer: Customer): ServiceOrderStatus {
  if (!customer.serviceOrders?.length) {
    return "PLANNED";
  }
  const sorted = [...customer.serviceOrders].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  return sorted[0]?.status ?? "PLANNED";
}

type ActivityEntry = {
  timestamp: string;
  text: string;
};

function extractActivityEntries(notes?: string | null): ActivityEntry[] {
  if (!notes) return [];
  const entries: ActivityEntry[] = [];
  for (const line of notes.split(/\r?\n/)) {
    if (!line.startsWith(ACTIVITY_PREFIX)) continue;
    const payload = line.slice(ACTIVITY_PREFIX.length);
    const separator = payload.indexOf("|");
    if (separator < 0) continue;
    const timestamp = payload.slice(0, separator);
    const text = payload.slice(separator + 1).trim();
    if (!timestamp || !text) continue;
    entries.push({ timestamp, text });
  }
  return entries.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

function stripActivityLines(notes?: string | null) {
  if (!notes) return "";
  return notes
    .split(/\r?\n/)
    .filter((line) => !line.startsWith(ACTIVITY_PREFIX))
    .join("\n")
    .trim();
}

function splitCustomerName(value?: string | null) {
  const normalized = value?.trim() ?? "";
  if (!normalized) {
    return { firstName: "", lastName: "" };
  }
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

export default function CustomersPage() {
  const router = useRouter();
  const { authorizedRequest, loading: authLoading, tokens } = useAuth();

  const [selectedType, setSelectedType] = useState<"all" | CustomerType>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [data, setData] = useState<CustomerListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const [modalConfig, setModalConfig] = useState<{ mode: "create" | "edit"; customer?: Customer | null } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
  });
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<InviteCustomerPortalUserResponse | null>(null);
  const [customerSettingsOpen, setCustomerSettingsOpen] = useState(false);
  const [customerPackageDraft, setCustomerPackageDraft] =
    useState<CustomerPackage>("STARTER");
  const [packageServicesDraft, setPackageServicesDraft] = useState<
    CustomerPackageService[]
  >([]);
  const [customerSettingsSaving, setCustomerSettingsSaving] = useState(false);
  const [customerSettingsNotice, setCustomerSettingsNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [csvImporting, setCsvImporting] = useState(false);
  const [csvImportMessage, setCsvImportMessage] = useState<string | null>(null);
  const [csvImportError, setCsvImportError] = useState<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement | null>(null);

  const [composerOpen, setComposerOpen] = useState(false);
  const [composerCustomer, setComposerCustomer] = useState<Customer | null>(null);

  const [pipelineFormOpen, setPipelineFormOpen] = useState(false);
  const [pipelineForm, setPipelineForm] = useState<PipelineFormState>(initialPipelineForm);
  const [pipelineSaving, setPipelineSaving] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);

  const [activityNote, setActivityNote] = useState("");
  const [activitySaving, setActivitySaving] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);

  const [customerFolders, setCustomerFolders] = useState<Record<string, DriveFolder>>({});
  const [folderError, setFolderError] = useState<string | null>(null);
  const [filesByCustomer, setFilesByCustomer] = useState<Record<string, DriveFile[]>>({});
  const [filesLoadingCustomerId, setFilesLoadingCustomerId] = useState<string | null>(null);
  const [uploadingCustomerId, setUploadingCustomerId] = useState<string | null>(null);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [driveError, setDriveError] = useState<string | null>(null);
  const driveInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchCustomers = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (selectedType !== "all") {
          params.set("type", selectedType);
        }
        if (debouncedSearch.trim()) {
          params.set("search", debouncedSearch.trim());
        }
        const query = params.toString() ? `?${params.toString()}` : "";
        const response = await authorizedRequest<CustomerListResponse>(`/customers${query}`, {
          signal,
        });
        setData(response);
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          return;
        }
        setError(err instanceof Error ? err.message : "Kunden konnten nicht geladen werden.");
      } finally {
        setLoading(false);
      }
    },
    [authorizedRequest, selectedType, debouncedSearch],
  );

  useEffect(() => {
    if (authLoading) {
      return;
    }
    const controller = new AbortController();
    void fetchCustomers(controller.signal);
    return () => controller.abort();
  }, [authLoading, fetchCustomers]);

  useEffect(() => {
    if (!data?.items.length) {
      setSelectedCustomerId(null);
      return;
    }
    setSelectedCustomerId((current) => {
      if (current && data.items.some((customer) => customer.id === current)) {
        return current;
      }
      return data.items[0]?.id ?? null;
    });
  }, [data]);

  const activeCustomer: Customer | null = useMemo(() => {
    if (!data?.items.length || !selectedCustomerId) return null;
    return data.items.find((customer) => customer.id === selectedCustomerId) ?? data.items[0] ?? null;
  }, [data, selectedCustomerId]);

  const syncCustomerFolders = useCallback(
    async (customers: Customer[]) => {
      if (!tokens?.accessToken || customers.length === 0) return;
      setFolderError(null);
      try {
        const root = await authorizedRequest<DriveFolder>("/drive/customers/root");
        const existing = await authorizedRequest<DriveFolder[]>(
          `/drive/folders?scope=TEAM&parentId=${encodeURIComponent(root.id)}`,
        );
        const nextMap: Record<string, DriveFolder> = {};
        for (const folder of existing) {
          if (folder.kind === "CUSTOMER" && folder.customerId) {
            nextMap[folder.customerId] = folder;
          }
        }

        const missing = customers.filter((customer) => !nextMap[customer.id]);
        for (const customer of missing) {
          const created = await authorizedRequest<DriveFolder>(
            `/drive/customers/${encodeURIComponent(customer.id)}/folder`,
          );
          nextMap[customer.id] = created;
        }

        setCustomerFolders(nextMap);
      } catch (err) {
        setFolderError(err instanceof Error ? err.message : "Kundenordner konnten nicht synchronisiert werden.");
      }
    },
    [authorizedRequest, tokens?.accessToken],
  );

  useEffect(() => {
    if (!data?.items?.length) return;
    void syncCustomerFolders(data.items);
  }, [data?.items, syncCustomerFolders]);

  const ensureCustomerFolder = useCallback(
    async (customer: Customer): Promise<DriveFolder> => {
      const existing = customerFolders[customer.id];
      if (
        existing &&
        existing.kind === "CUSTOMER" &&
        existing.customerId === customer.id &&
        existing.parentId
      ) {
        return existing;
      }

      const created = await authorizedRequest<DriveFolder>(
        `/drive/customers/${encodeURIComponent(customer.id)}/folder`,
      );

      setCustomerFolders((prev) => ({ ...prev, [customer.id]: created }));
      return created;
    },
    [authorizedRequest, customerFolders],
  );

  const loadCustomerFiles = useCallback(
    async (customer: Customer) => {
      setDriveError(null);
      setFilesLoadingCustomerId(customer.id);
      try {
        const folder = await ensureCustomerFolder(customer);
        const response = await authorizedRequest<DriveFileListResponse>(
          `/drive/files?scope=TEAM&folderId=${folder.id}&limit=50`,
        );
        setFilesByCustomer((prev) => ({
          ...prev,
          [customer.id]: response.items,
        }));
        setCustomerFolders((prev) => {
          const current = prev[customer.id];
          if (!current) return prev;
          return {
            ...prev,
            [customer.id]: {
              ...current,
              fileCount: response.items.length,
            },
          };
        });
      } catch (err) {
        setDriveError(err instanceof Error ? err.message : "Dateien konnten nicht geladen werden.");
      } finally {
        setFilesLoadingCustomerId(null);
      }
    },
    [authorizedRequest, ensureCustomerFolder],
  );

  useEffect(() => {
    if (!activeCustomer || !tokens?.accessToken) {
      return;
    }
    void loadCustomerFiles(activeCustomer);
  }, [activeCustomer, loadCustomerFiles, tokens?.accessToken]);

  const handleCustomerSaved = useCallback(
    (customer: Customer) => {
      setSelectedCustomerId(customer.id);
      void fetchCustomers();
      void ensureCustomerFolder(customer);
    },
    [ensureCustomerFolder, fetchCustomers],
  );

  const handleDeleteCustomer = useCallback(async () => {
    if (!activeCustomer) {
      return;
    }
    const confirmed = window.confirm(`Willst du ${activeCustomer.name} wirklich löschen?`);
    if (!confirmed) {
      return;
    }

    setDeleteLoading(true);
    setError(null);
    try {
      await authorizedRequest(`/customers/${activeCustomer.id}`, { method: "DELETE" });
      setSelectedCustomerId(null);
      await fetchCustomers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde konnte nicht gelöscht werden.");
    } finally {
      setDeleteLoading(false);
    }
  }, [activeCustomer, authorizedRequest, fetchCustomers]);

  const handleOpenInviteModal = useCallback(() => {
    if (!activeCustomer) return;
    const splitName = splitCustomerName(activeCustomer.name);
    setInviteError(null);
    setInviteResult(null);
    setInviteForm({
      email: activeCustomer.email ?? "",
      firstName: splitName.firstName,
      lastName: splitName.lastName,
    });
    setInviteModalOpen(true);
  }, [activeCustomer]);

  const hydrateCustomerSettingsDraft = useCallback((customer: Customer) => {
    setCustomerPackageDraft(customer.customerPackage);
    setPackageServicesDraft(() => {
      const normalized = normalizePackageServices(customer.packageServices);
      if (normalized.length > 0) {
        return normalized;
      }
      return buildPackageServicesFromTemplate(customer.customerPackage);
    });
    setCustomerSettingsNotice(null);
  }, []);

  const handleOpenCustomerSettings = useCallback(() => {
    if (!activeCustomer) return;
    hydrateCustomerSettingsDraft(activeCustomer);
    setCustomerSettingsNotice(null);
    setCustomerSettingsOpen(true);
  }, [activeCustomer, hydrateCustomerSettingsDraft]);

  const handleSelectCustomerPackage = useCallback((nextPackage: CustomerPackage) => {
    setCustomerPackageDraft(nextPackage);
    setPackageServicesDraft((current) =>
      current.length > 0 ? current : buildPackageServicesFromTemplate(nextPackage),
    );
  }, []);

  const handleResetPackageServicesFromTemplate = useCallback(() => {
    setPackageServicesDraft(buildPackageServicesFromTemplate(customerPackageDraft));
  }, [customerPackageDraft]);

  const handleAddPackageService = useCallback(() => {
    setPackageServicesDraft((current) => [
      ...current,
      {
        id: createPackageServiceId(),
        title: "",
        description: "",
      },
    ]);
  }, []);

  const handleUpdatePackageService = useCallback(
    (id: string, next: Partial<CustomerPackageService>) => {
      setPackageServicesDraft((current) =>
        current.map((service) =>
          service.id === id ? { ...service, ...next } : service,
        ),
      );
    },
    [],
  );

  const handleRemovePackageService = useCallback((id: string) => {
    setPackageServicesDraft((current) =>
      current.filter((service) => service.id !== id),
    );
  }, []);

  const handleInviteCustomer = useCallback(async () => {
    if (!activeCustomer) return;
    setInviteSending(true);
    setInviteError(null);
    setInviteResult(null);

    try {
      const payload = {
        email: inviteForm.email.trim() || undefined,
        firstName: inviteForm.firstName.trim() || undefined,
        lastName: inviteForm.lastName.trim() || undefined,
      };

      const response = await authorizedRequest<InviteCustomerPortalUserResponse>(
        `/customers/${activeCustomer.id}/invite-portal-user`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );
      setInviteResult(response);
      await fetchCustomers();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Einladung konnte nicht gesendet werden.");
    } finally {
      setInviteSending(false);
    }
  }, [activeCustomer, authorizedRequest, fetchCustomers, inviteForm.email, inviteForm.firstName, inviteForm.lastName]);

  const handleSaveCustomerSettings = useCallback(async () => {
    if (!activeCustomer) return;
    setCustomerSettingsSaving(true);
    setCustomerSettingsNotice(null);
    try {
      await authorizedRequest(`/customers/${activeCustomer.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          customerPackage: customerPackageDraft,
          packageServices: normalizePackageServices(packageServicesDraft),
        }),
      });
      setCustomerSettingsNotice({
        type: "success",
        text: "Kundeneinstellungen wurden gespeichert.",
      });
      await fetchCustomers();
    } catch (err) {
      setCustomerSettingsNotice({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Kundeneinstellungen konnten nicht gespeichert werden.",
      });
    } finally {
      setCustomerSettingsSaving(false);
    }
  }, [
    activeCustomer,
    authorizedRequest,
    customerPackageDraft,
    fetchCustomers,
    packageServicesDraft,
  ]);

  const handleCsvImport = useCallback(
    async (file: File) => {
      setCsvImportError(null);
      setCsvImportMessage(null);
      setCsvImporting(true);
      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await authorizedRequest<{ imported: number; skipped: number; errors: string[] }>(
          "/customers/import",
          {
            method: "POST",
            body: formData,
          },
        );
        setCsvImportMessage(`Importiert: ${response.imported} · Übersprungen: ${response.skipped}`);
        if (response.errors.length) {
          setCsvImportError(response.errors.join(" | "));
        }
        await fetchCustomers();
      } catch (err) {
        setCsvImportError(err instanceof Error ? err.message : "CSV-Import fehlgeschlagen.");
      } finally {
        setCsvImporting(false);
        if (csvInputRef.current) {
          csvInputRef.current.value = "";
        }
      }
    },
    [authorizedRequest, fetchCustomers],
  );

  const handleCsvChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        void handleCsvImport(file);
      }
    },
    [handleCsvImport],
  );

  const handlePipelineCreate = useCallback(async () => {
    if (!activeCustomer) return;
    if (!pipelineForm.title.trim()) {
      setPipelineError("Bitte einen Titel für den Pipeline-Schritt angeben.");
      return;
    }

    setPipelineSaving(true);
    setPipelineError(null);
    try {
      const estimateCents = parseEuroToCents(pipelineForm.expectedValue);
      const closedCents = parseEuroToCents(pipelineForm.closedValue);

      await authorizedRequest(`/customers/${activeCustomer.id}/service-orders`, {
        method: "POST",
        body: JSON.stringify({
          title: pipelineForm.title.trim(),
          status: pipelineForm.stage,
          concern: pipelineForm.objective.trim() || undefined,
          advisorName: pipelineForm.owner.trim() || undefined,
          scheduledAt: pipelineForm.followUpAt
            ? new Date(pipelineForm.followUpAt).toISOString()
            : undefined,
          completedAt:
            pipelineForm.stage === "COMPLETED" || pipelineForm.stage === "CANCELLED"
              ? new Date().toISOString()
              : undefined,
          estimateCents: estimateCents ?? undefined,
          totalCents: closedCents ?? undefined,
          notes: pipelineForm.lastStep.trim() || undefined,
        }),
      });

      setPipelineForm(initialPipelineForm);
      setPipelineFormOpen(false);
      await fetchCustomers();
    } catch (err) {
      setPipelineError(err instanceof Error ? err.message : "Pipeline-Schritt konnte nicht erstellt werden.");
    } finally {
      setPipelineSaving(false);
    }
  }, [activeCustomer, authorizedRequest, fetchCustomers, pipelineForm]);

  const handleActivityAdd = useCallback(async () => {
    if (!activeCustomer) return;
    if (!activityNote.trim()) {
      setActivityError("Bitte einen Schritttext eingeben.");
      return;
    }

    setActivitySaving(true);
    setActivityError(null);
    try {
      const line = `${ACTIVITY_PREFIX}${new Date().toISOString()}|${activityNote.trim()}`;
      const notes = [activeCustomer.notes?.trim(), line].filter(Boolean).join("\n");
      await authorizedRequest(`/customers/${activeCustomer.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          notes,
          lastContactAt: new Date().toISOString(),
        }),
      });
      setActivityNote("");
      await fetchCustomers();
    } catch (err) {
      setActivityError(err instanceof Error ? err.message : "Schritt konnte nicht gespeichert werden.");
    } finally {
      setActivitySaving(false);
    }
  }, [activeCustomer, activityNote, authorizedRequest, fetchCustomers]);

  const handleOpenDrive = useCallback(async () => {
    if (!activeCustomer) return;
    try {
      const folder = await ensureCustomerFolder(activeCustomer);
      router.push(`/drive?tab=team&folderId=${folder.id}`);
    } catch (err) {
      setDriveError(err instanceof Error ? err.message : "Drive-Ordner konnte nicht geöffnet werden.");
    }
  }, [activeCustomer, ensureCustomerFolder, router]);

  const handleUploadClick = useCallback((customerId: string) => {
    setDriveError(null);
    setUploadingCustomerId(customerId);
    driveInputRef.current?.click();
  }, []);

  const handleDriveUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file || !uploadingCustomerId || !data?.items?.length) {
        return;
      }

      const customer = data.items.find((entry) => entry.id === uploadingCustomerId);
      if (!customer) {
        setUploadingCustomerId(null);
        return;
      }

      setDriveError(null);
      try {
        const customerFolder = await ensureCustomerFolder(customer);
        const payload = new FormData();
        payload.set("name", file.name);
        payload.append("file", file);

        const uploaded = await authorizedRequest<DriveFile>(
          `/drive/customers/${encodeURIComponent(customer.id)}/files`,
          {
            method: "POST",
            body: payload,
          },
        );
        if (uploaded.folderId !== customerFolder.id) {
          await authorizedRequest(`/drive/files/${uploaded.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ folderId: customerFolder.id }),
          });
        }

        await loadCustomerFiles(customer);
      } catch (err) {
        setDriveError(err instanceof Error ? err.message : "Datei konnte nicht hochgeladen werden.");
      } finally {
        setUploadingCustomerId(null);
      }
    },
    [authorizedRequest, data?.items, ensureCustomerFolder, loadCustomerFiles, uploadingCustomerId],
  );

  const handleDeleteFile = useCallback(
    async (customer: Customer, file: DriveFile) => {
      setDriveError(null);
      setDeletingFileId(file.id);
      try {
        await authorizedRequest(`/drive/files/${file.id}`, { method: "DELETE" });
        await loadCustomerFiles(customer);
      } catch (err) {
        setDriveError(err instanceof Error ? err.message : "Datei konnte nicht gelöscht werden.");
      } finally {
        setDeletingFileId(null);
      }
    },
    [authorizedRequest, loadCustomerFiles],
  );

  const openComposerForContact = (contact: CustomerContact) => {
    if (!activeCustomer) return;
    const reorderedContacts = [contact, ...activeCustomer.contacts.filter((c) => c.id !== contact.id)];
    setComposerCustomer({ ...activeCustomer, contacts: reorderedContacts });
    setComposerOpen(true);
  };

  const activeStage = activeCustomer ? getCurrentStage(activeCustomer) : "PLANNED";
  const stageMeta = getStageMeta(activeStage);
  const activityEntries = extractActivityEntries(activeCustomer?.notes);
  const plainNotes = stripActivityLines(activeCustomer?.notes);
  const customerFiles = activeCustomer ? filesByCustomer[activeCustomer.id] ?? [] : [];
  const activeFolder = activeCustomer ? customerFolders[activeCustomer.id] : undefined;

  const modalOpen = modalConfig !== null;

  return (
    <div className="space-y-6 px-4 py-6 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Agency CRM</p>
          <h1 className="text-2xl font-semibold text-white">Kunden, Pipeline & Aktivitäten</h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setModalConfig({ mode: "create" })} className="gap-2">
            <UserPlus className="h-4 w-4" />
            Neuer Kunde
          </Button>
          <Button
            variant="outline"
            onClick={() => csvInputRef.current?.click()}
            disabled={csvImporting}
            className="gap-2 border-white/10 text-white hover:bg-white/10"
          >
            <Upload className="h-4 w-4" />
            CSV Import
          </Button>
          <input ref={csvInputRef} type="file" accept=".csv" hidden onChange={handleCsvChange} />
        </div>
      </div>

      {csvImportMessage && <p className="text-sm text-emerald-300">{csvImportMessage}</p>}
      {csvImportError && <p className="text-sm text-rose-300">{csvImportError}</p>}
      {error && <p className="text-sm text-rose-300">{error}</p>}
      {folderError && <p className="text-sm text-rose-300">{folderError}</p>}
      {driveError && <p className="text-sm text-rose-300">{driveError}</p>}

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="lg:w-[420px] lg:flex lg:flex-col">
          <div className="rounded-[24px] border border-white/10 bg-slate-950/70 p-4 text-white shadow-2xl lg:flex lg:flex-col">
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/70 px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Name, E-Mail, Ansprechpartner ..."
                className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {typeFilters.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setSelectedType(filter.value)}
                  className={clsx(
                    "rounded-full border px-4 py-1 text-sm transition",
                    selectedType === filter.value
                      ? "border-sky-400 bg-sky-500/30 text-white shadow-sm"
                      : "border-white/10 bg-slate-900/60 text-slate-200 hover:border-sky-400/50",
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <div className="mt-4 max-h-[560px] space-y-3 overflow-y-auto pr-1">
              {loading && <p className="text-sm text-slate-300">Lade Kunden ...</p>}
              {!loading && !data?.items.length && <p className="text-sm text-slate-300">Keine Kunden gefunden.</p>}
              {data?.items.map((customer) => {
                const currentStage = getStageMeta(getCurrentStage(customer));
                const activePipeline = (customer.serviceOrders ?? []).filter(
                  (entry) => entry.status === "PLANNED" || entry.status === "IN_SERVICE",
                ).length;
                const customerFolder = customerFolders[customer.id];
                const customerFileCount = customerFolder?.fileCount ?? 0;

                return (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => setSelectedCustomerId(customer.id)}
                    className={clsx(
                      "w-full rounded-2xl border px-4 py-3 text-left transition",
                      selectedCustomerId === customer.id
                        ? "border-sky-400 bg-sky-900/40 text-white shadow-md"
                        : "border-white/10 bg-slate-900/60 text-white hover:border-sky-400/50 hover:bg-slate-900/70",
                    )}
                  >
                    <div className="flex items-center justify-between text-sm font-semibold text-white">
                      <span>{customer.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-slate-200">
                          {customerFileCount} Dateien
                        </span>
                        <span className="text-xs uppercase tracking-[0.2em] text-slate-300">
                          {formatCustomerType(customer.type)}
                        </span>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-slate-300">Letzter Kontakt: {formatDate(customer.lastContactAt)}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-200">
                      <span className="rounded-full bg-white/10 px-2 py-0.5">{currentStage.label}</span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5">{activePipeline} aktiv</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex-1">
          {activeCustomer ? (
            <div className="space-y-4">
              <Card className="border border-white/10 bg-white/5 p-6 text-white">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Kundenprofil</p>
                    <h2 className="text-2xl font-semibold">{activeCustomer.name}</h2>
                    <p className="text-sm text-slate-300">Segment: {formatCustomerType(activeCustomer.type)}</p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {activeCustomer.portalAccessEnabled ? (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleOpenCustomerSettings}
                        className="border-amber-400/50 text-amber-200 hover:bg-amber-500/15"
                        aria-label="Kundeneinstellungen"
                        title="Kundeneinstellungen"
                      >
                        <EllipsisVertical className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={handleOpenInviteModal}
                        className="border-amber-400/50 text-amber-200 hover:bg-amber-500/15"
                      >
                        <UserPlus className="mr-2 h-4 w-4" />
                        Kunde einladen
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => setModalConfig({ mode: "edit", customer: activeCustomer })}
                      className="border-white/10 text-white"
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Bearbeiten
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={handleDeleteCustomer}
                      disabled={deleteLoading}
                      className="gap-2 text-rose-300"
                    >
                      <Trash2 className="h-4 w-4" />
                      {deleteLoading ? "Lösche..." : "Löschen"}
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 text-sm text-slate-200">
                    {activeCustomer.email && (
                      <p className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-slate-400" />
                        {activeCustomer.email}
                      </p>
                    )}
                    {activeCustomer.phone && (
                      <p className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-slate-400" />
                        {activeCustomer.phone}
                      </p>
                    )}
                    {(activeCustomer.street || activeCustomer.city) && (
                      <p className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-slate-400" />
                        {[activeCustomer.street, activeCustomer.postalCode, activeCustomer.city]
                          .filter(Boolean)
                          .join(" ")}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2 text-sm text-slate-200">
                    <p>Umsatz: {formatEuro(activeCustomer.totalSpendCents)}</p>
                    <p>Letzter Kontakt: {formatDate(activeCustomer.lastContactAt)}</p>
                    <p>Marketing Opt-in: {activeCustomer.marketingOptIn ? "Ja" : "Nein"}</p>
                    <p>
                      Paket:{" "}
                      <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-amber-200">
                        {formatCustomerPackage(activeCustomer.customerPackage)}
                      </span>
                    </p>
                    <p>Dienstleistungen im Paket: {activeCustomer.packageServices.length}</p>
                    <p>
                      Aktuelle Phase: <span className="rounded-full bg-white/10 px-2 py-0.5">{stageMeta.label}</span>
                    </p>
                  </div>
                </div>

                {activeCustomer.tags.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {activeCustomer.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-slate-900/40 px-3 py-1 text-xs text-slate-200">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {plainNotes && <p className="mt-4 whitespace-pre-wrap text-sm text-slate-200">{plainNotes}</p>}
              </Card>

              <div className="space-y-4">
                {activeCustomer.contacts.length > 0 && (
                  <Card className="border border-white/10 bg-white/5 p-5 text-white">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Kontakte</p>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-full border border-white/10 bg-white/5 px-3"
                        onClick={() => setModalConfig({ mode: "edit", customer: activeCustomer })}
                      >
                        Kontakt hinzufügen
                      </Button>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {activeCustomer.contacts.map((contact) => (
                        <div
                          key={contact.id}
                          className="h-full rounded-2xl border border-white/5 bg-white/5 p-4 text-sm text-slate-200"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              {contact.role && (
                                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[12px] text-slate-200">
                                  {contact.role}
                                </span>
                              )}
                              <p className="mt-2 text-base font-semibold text-white">{contact.name}</p>
                            </div>
                            {contact.channel && (
                              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[12px] text-slate-200">
                                {contact.channel}
                              </span>
                            )}
                          </div>
                          <div className="mt-3 space-y-2">
                            {contact.email && (
                              <div className="flex items-center gap-2 text-slate-200">
                                <Mail className="h-4 w-4 text-slate-400" />
                                <span className="truncate">{contact.email}</span>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 rounded-full border border-white/10 bg-white/5"
                                  onClick={() => openComposerForContact(contact)}
                                  aria-label="E-Mail schreiben"
                                >
                                  <ArrowUpRight className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                            {contact.phone && (
                              <p className="flex items-center gap-2 text-slate-200">
                                <Phone className="h-4 w-4 text-slate-400" />
                                <span className="truncate">{contact.phone}</span>
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                <Card className="border border-white/10 bg-white/5 p-5 text-white">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Sales Pipeline</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-full border border-white/10 bg-white/5 px-3"
                      onClick={() => {
                        setPipelineError(null);
                        setPipelineForm(initialPipelineForm);
                        setPipelineFormOpen((prev) => !prev);
                      }}
                    >
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Pipeline-Schritt
                    </Button>
                  </div>

                  {pipelineFormOpen && (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/40 p-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Titel</label>
                          <Input
                            value={pipelineForm.title}
                            onChange={(event) =>
                              setPipelineForm((prev) => ({ ...prev, title: event.target.value }))
                            }
                            placeholder="Retainer Q2 / Kampagnen-Setup"
                          />
                        </div>
                        <div>
                          <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Phase</label>
                          <select
                            value={pipelineForm.stage}
                            onChange={(event) =>
                              setPipelineForm((prev) => ({
                                ...prev,
                                stage: event.target.value as ServiceOrderStatus,
                              }))
                            }
                            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
                          >
                            {pipelineStageOptions.map((option) => (
                              <option key={option.value} value={option.value} className="bg-slate-900 text-white">
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Owner</label>
                          <Input
                            value={pipelineForm.owner}
                            onChange={(event) =>
                              setPipelineForm((prev) => ({ ...prev, owner: event.target.value }))
                            }
                            placeholder="Account Manager"
                          />
                        </div>
                        <div>
                          <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Follow-up</label>
                          <Input
                            type="datetime-local"
                            value={pipelineForm.followUpAt}
                            onChange={(event) =>
                              setPipelineForm((prev) => ({ ...prev, followUpAt: event.target.value }))
                            }
                          />
                        </div>
                        <div>
                          <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Expected Value (EUR)</label>
                          <Input
                            value={pipelineForm.expectedValue}
                            onChange={(event) =>
                              setPipelineForm((prev) => ({ ...prev, expectedValue: event.target.value }))
                            }
                            placeholder="3500"
                          />
                        </div>
                        <div>
                          <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Closed Value (EUR)</label>
                          <Input
                            value={pipelineForm.closedValue}
                            onChange={(event) =>
                              setPipelineForm((prev) => ({ ...prev, closedValue: event.target.value }))
                            }
                            placeholder="3200"
                          />
                        </div>
                      </div>
                      <div className="mt-3">
                        <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Ziel / Kontext</label>
                        <Input
                          value={pipelineForm.objective}
                          onChange={(event) =>
                            setPipelineForm((prev) => ({ ...prev, objective: event.target.value }))
                          }
                          placeholder="Lead Nurturing + Conversion Landingpage"
                        />
                      </div>
                      <div className="mt-3">
                        <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Letzter Schritt</label>
                        <Textarea
                          rows={3}
                          value={pipelineForm.lastStep}
                          onChange={(event) =>
                            setPipelineForm((prev) => ({ ...prev, lastStep: event.target.value }))
                          }
                          placeholder="Workshop durchgeführt, Angebot verschickt, Feedback bis Freitag erwartet ..."
                        />
                      </div>
                      {pipelineError && <p className="mt-2 text-sm text-rose-300">{pipelineError}</p>}
                      <div className="mt-3 flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          onClick={() => setPipelineFormOpen(false)}
                          className="rounded-full border border-white/10"
                        >
                          Abbrechen
                        </Button>
                        <Button onClick={() => void handlePipelineCreate()} disabled={pipelineSaving}>
                          {pipelineSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Speichern
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 space-y-3">
                    {!activeCustomer.serviceOrders.length && (
                      <p className="text-sm text-slate-300">Noch keine Pipeline-Schritte vorhanden.</p>
                    )}
                    {[...activeCustomer.serviceOrders]
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .map((entry) => {
                        const meta = getStageMeta(entry.status);
                        return (
                          <div key={entry.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold text-white">{entry.title}</p>
                                <p className="text-xs text-slate-300">{formatDate(entry.createdAt)}</p>
                              </div>
                              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-100">
                                {meta.label}
                              </span>
                            </div>
                            <div className="mt-3 grid gap-2 text-xs text-slate-200 md:grid-cols-2">
                              <p>Owner: {entry.advisorName || "–"}</p>
                              <p>Follow-up: {formatDate(entry.scheduledAt)}</p>
                              <p>Expected: {formatEuro(entry.estimateCents)}</p>
                              <p>Closed: {formatEuro(entry.totalCents)}</p>
                            </div>
                            {entry.concern && <p className="mt-2 text-xs text-slate-300">Ziel: {entry.concern}</p>}
                            {entry.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">{entry.notes}</p>}
                          </div>
                        );
                      })}
                  </div>
                </Card>

                <Card className="border border-white/10 bg-white/5 p-5 text-white">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Aktivität / letzte Schritte</p>
                    <Clock3 className="h-4 w-4 text-slate-400" />
                  </div>

                  <div className="mt-4 space-y-2">
                    <Textarea
                      rows={3}
                      value={activityNote}
                      onChange={(event) => setActivityNote(event.target.value)}
                      placeholder="Was ist als letzter Schritt passiert?"
                    />
                    {activityError && <p className="text-sm text-rose-300">{activityError}</p>}
                    <div className="flex justify-end">
                      <Button onClick={() => void handleActivityAdd()} disabled={activitySaving}>
                        {activitySaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Schritt dokumentieren
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    {activityEntries.length === 0 && (
                      <p className="text-sm text-slate-300">Noch keine dokumentierten Schritte.</p>
                    )}
                    {activityEntries.map((entry) => (
                      <div key={`${entry.timestamp}-${entry.text.slice(0, 12)}`} className="rounded-2xl border border-white/10 bg-slate-900/40 p-3">
                        <p className="text-xs text-slate-400">{formatDate(entry.timestamp)}</p>
                        <p className="mt-1 text-sm text-slate-100">{entry.text}</p>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="border border-white/10 bg-white/5 p-5 text-white">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Drive Ordner</p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-full border border-white/10 bg-white/5"
                        onClick={() => void handleOpenDrive()}
                      >
                        <FolderOpen className="mr-2 h-4 w-4" />
                        Im Drive öffnen
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-full border border-white/10 bg-white/5"
                        onClick={() => handleUploadClick(activeCustomer.id)}
                        disabled={uploadingCustomerId === activeCustomer.id}
                      >
                        {uploadingCustomerId === activeCustomer.id ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Lädt...
                          </>
                        ) : (
                          <>
                            <Upload className="mr-2 h-4 w-4" />
                            Datei hochladen
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  <p className="mt-2 text-xs text-slate-300">
                    Ordner: <span className="font-medium text-slate-100">{activeFolder?.name ?? "wird erstellt..."}</span>
                  </p>

                  <div className="mt-4 space-y-2">
                    {filesLoadingCustomerId === activeCustomer.id && (
                      <p className="text-sm text-slate-300">Dateien werden geladen ...</p>
                    )}
                    {!customerFiles.length && filesLoadingCustomerId !== activeCustomer.id && (
                      <p className="text-sm text-slate-300">Noch keine Dateien im Kundenordner.</p>
                    )}
                    {customerFiles.map((file) => (
                      <div key={file.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/40 px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-white">{file.name}</p>
                          <p className="text-xs text-slate-400">{formatDate(file.createdAt)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-full border border-white/10 bg-white/5"
                            onClick={() => void handleOpenDrive()}
                          >
                            <FileText className="mr-2 h-4 w-4" />
                            Verwalten
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-full border border-white/10 bg-white/5 text-rose-300"
                            disabled={deletingFileId === file.id}
                            onClick={() => void handleDeleteFile(activeCustomer, file)}
                          >
                            {deletingFileId === file.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>
          ) : (
            <Card className="border border-dashed border-white/10 bg-transparent p-6 text-center text-slate-300">
              Bitte einen Kunden aus der Liste auswählen oder neu anlegen.
            </Card>
          )}
        </div>
      </div>

      <input
        ref={driveInputRef}
        type="file"
        hidden
        onChange={handleDriveUpload}
      />

      <Modal
        isOpen={customerSettingsOpen}
        onClose={() => {
          setCustomerSettingsOpen(false);
          setCustomerSettingsNotice(null);
        }}
        title={`Kundeneinstellungen${activeCustomer ? ` · ${activeCustomer.name}` : ""}`}
        className="max-h-[92vh] max-w-[96vw] overflow-y-auto lg:max-w-[1320px]"
      >
        <div className="space-y-4 text-sm text-slate-200">
          <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Portal Paket</p>
            <p className="mt-1 text-sm text-slate-300">
              Dieses Paket wird im Kundendashboard angezeigt und steuert den Umfang.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {customerPackageOptions.map((option) => {
                const active = customerPackageDraft === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSelectCustomerPackage(option.value)}
                    className={clsx(
                      "rounded-2xl border bg-gradient-to-br p-4 text-left transition-all",
                      option.accentClassName,
                      active
                        ? "ring-2 ring-white/70 shadow-[0_18px_34px_-26px_rgba(255,255,255,0.8)]"
                        : "opacity-80 hover:opacity-100",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-white">{option.label}</p>
                      {active ? (
                        <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] text-white">
                          Aktiv
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-xs text-slate-200/90">{option.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                  Dienstleistungen
                </p>
                <p className="mt-1 text-sm text-slate-300">
                  Dienstleistungen für dieses Paket hinzufügen, beschreiben und anpassen.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="border border-white/10"
                  onClick={handleResetPackageServicesFromTemplate}
                >
                  Vorlagen laden
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="border border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/15"
                  onClick={handleAddPackageService}
                >
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Dienstleistung
                </Button>
              </div>
            </div>

            <div className="mt-4 max-h-[320px] space-y-3 overflow-y-auto pr-1">
              {!packageServicesDraft.length ? (
                <p className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-xs text-slate-400">
                  Keine Dienstleistungen hinterlegt.
                </p>
              ) : null}
              {packageServicesDraft.map((service, index) => (
                <div
                  key={service.id}
                  className="rounded-2xl border border-white/10 bg-slate-950/40 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Leistung {index + 1}
                    </p>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 border border-rose-400/30 text-rose-200 hover:bg-rose-500/15"
                      onClick={() => handleRemovePackageService(service.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="mt-2 space-y-2">
                    <Input
                      value={service.title}
                      onChange={(event) =>
                        handleUpdatePackageService(service.id, {
                          title: event.target.value,
                        })
                      }
                      placeholder="Titel der Dienstleistung"
                    />
                    <Textarea
                      value={service.description ?? ""}
                      onChange={(event) =>
                        handleUpdatePackageService(service.id, {
                          description: event.target.value,
                        })
                      }
                      placeholder="Beschreibung"
                      rows={3}
                      className="min-h-[90px]"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {customerSettingsNotice ? (
            <p
              className={clsx(
                "rounded-xl border px-3 py-2 text-xs",
                customerSettingsNotice.type === "success"
                  ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                  : "border-rose-400/40 bg-rose-500/10 text-rose-200",
              )}
            >
              {customerSettingsNotice.text}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              className="border border-amber-400/40 text-amber-200 hover:bg-amber-500/15"
              onClick={() => {
                setCustomerSettingsOpen(false);
                setCustomerSettingsNotice(null);
                handleOpenInviteModal();
              }}
            >
              <UserPlus className="mr-2 h-4 w-4" />
              Zugang neu senden
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                className="border border-white/10"
                onClick={() => setCustomerSettingsOpen(false)}
                disabled={customerSettingsSaving}
              >
                Schließen
              </Button>
              <Button
                type="button"
                onClick={() => void handleSaveCustomerSettings()}
                disabled={customerSettingsSaving}
                className="bg-amber-500 text-slate-950 hover:bg-amber-400"
              >
                {customerSettingsSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Package className="mr-2 h-4 w-4" />
                )}
                Paket speichern
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={inviteModalOpen}
        onClose={() => {
          setInviteModalOpen(false);
          setInviteError(null);
          setInviteResult(null);
        }}
        title={`Kunde einladen${activeCustomer ? ` · ${activeCustomer.name}` : ""}`}
      >
        <div className="space-y-4 text-sm text-slate-200">
          <p>
            Erstellen oder aktualisieren Sie den Kundenzugang. Der Kunde erhält per E-Mail Login-Link und
            Startpasswort.
          </p>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.2em] text-slate-400">E-Mail</label>
            <Input
              type="email"
              value={inviteForm.email}
              onChange={(event) =>
                setInviteForm((prev) => ({
                  ...prev,
                  email: event.target.value,
                }))
              }
              placeholder="kunde@firma.de"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Vorname</label>
              <Input
                value={inviteForm.firstName}
                onChange={(event) =>
                  setInviteForm((prev) => ({
                    ...prev,
                    firstName: event.target.value,
                  }))
                }
                placeholder="Max"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Nachname</label>
              <Input
                value={inviteForm.lastName}
                onChange={(event) =>
                  setInviteForm((prev) => ({
                    ...prev,
                    lastName: event.target.value,
                  }))
                }
                placeholder="Mustermann"
              />
            </div>
          </div>

          {inviteError ? (
            <p className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-rose-200">
              {inviteError}
            </p>
          ) : null}

          {inviteResult ? (
            <div className="space-y-2 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-3 text-emerald-100">
              <p className="font-medium">Zugang gespeichert.</p>
              <p>
                Login: <span className="font-mono text-emerald-50">{inviteResult.user.email}</span>
              </p>
              <p>
                Startpasswort: <span className="font-mono text-emerald-50">{inviteResult.temporaryPassword}</span>
              </p>
              <p>
                E-Mail-Versand: {inviteResult.inviteEmailSent ? "gesendet" : "nicht gesendet"}
                {inviteResult.inviteEmailError ? ` (${inviteResult.inviteEmailError})` : ""}
              </p>
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              className="border border-white/10"
              onClick={() => setInviteModalOpen(false)}
              disabled={inviteSending}
            >
              Schließen
            </Button>
            <Button type="button" onClick={() => void handleInviteCustomer()} disabled={inviteSending}>
              {inviteSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
              Zugang senden
            </Button>
          </div>
        </div>
      </Modal>

      {modalOpen && (
        <CustomerModal
          mode={modalConfig?.mode ?? "create"}
          open={modalOpen}
          customer={modalConfig?.customer ?? null}
          onClose={() => setModalConfig(null)}
          onSaved={handleCustomerSaved}
        />
      )}

      {composerOpen && composerCustomer && (
        <ComposerModal
          isOpen={composerOpen}
          onClose={() => setComposerOpen(false)}
          onMessageSent={() => setComposerOpen(false)}
          customer={composerCustomer}
          thread={[]}
          messageToReplyTo={null}
          smtpReady
          smtpStatus={null}
          contactSuggestions={composerCustomer.contacts}
        />
      )}
    </div>
  );
}
