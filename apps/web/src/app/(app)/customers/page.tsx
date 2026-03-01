"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Car,
  Loader2,
  Mail,
  MapPin,
  ArrowUpRight,
  Pencil,
  Phone,
  PlusCircle,
  Search,
  Trash2,
  Upload,
  UserPlus,
  Wrench,
  X,
} from "lucide-react";
import { clsx } from "clsx";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  Customer,
  CustomerListResponse,
  CustomerType,
  DriveFile,
  DriveFileListResponse,
  DriveFolder,
  CustomerMessage,
  CustomerContact,
  Vehicle,
  VehicleFuelType,
  VehicleTransmission,
} from "@/lib/types";
import { authHeaders, buildApiUrl } from "@/lib/api";
import { CustomerModal } from "./customer-modal";
import { ComposerModal } from "../workspace/messages/composer-modal";

const typeFilters: { label: string; value: "all" | CustomerType }[] = [
  { label: "Alle", value: "all" },
  { label: "Privat", value: "PRIVATE" },
  { label: "Business", value: "BUSINESS" },
  { label: "Flotte", value: "FLEET" },
];

type VehicleModalState = { mode: "create" | "edit"; vehicle?: Vehicle | null };

const fuelTypeOptions: { label: string; value: VehicleFuelType }[] = [
  { label: "Benzin", value: "GASOLINE" },
  { label: "Diesel", value: "DIESEL" },
  { label: "Hybrid", value: "HYBRID" },
  { label: "Elektro", value: "ELECTRIC" },
  { label: "LPG", value: "LPG" },
  { label: "Sonstiges", value: "OTHER" },
];

const VEHICLE_DOCS_FOLDER = "Fahrzeugscheine";
const VEHICLE_DOC_PREFIX = "fahrzeugschein__";

const transmissionOptions: { label: string; value: VehicleTransmission }[] = [
  { label: "Handschaltung", value: "MANUAL" },
  { label: "Automatik", value: "AUTOMATIC" },
];

const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value?: string | null) {
  if (!value) {
    return "–";
  }
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

function formatFuelTypeLabel(value?: VehicleFuelType | "" | null) {
  const option = fuelTypeOptions.find((item) => item.value === value);
  return option?.label ?? value ?? "";
}

function formatTransmissionLabel(value?: VehicleTransmission | "" | null) {
  const option = transmissionOptions.find((item) => item.value === value);
  return option?.label ?? value ?? "";
}

function buildVehicleDocName(vehicleId: string, originalName: string) {
  const cleaned = originalName.trim().replace(/\s+/g, "_") || "upload";
  return `${VEHICLE_DOC_PREFIX}${vehicleId}__${cleaned}`;
}

function parseVehicleDocVehicleId(fileName: string) {
  if (!fileName.startsWith(VEHICLE_DOC_PREFIX)) {
    return null;
  }
  const payload = fileName.slice(VEHICLE_DOC_PREFIX.length);
  const [vehicleId] = payload.split("__");
  return vehicleId || null;
}

function toDateTimeInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

export default function CustomersPage() {
  const { authorizedRequest, tokens, loading: authLoading } = useAuth();
  const [selectedType, setSelectedType] = useState<"all" | CustomerType>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [data, setData] = useState<CustomerListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [modalConfig, setModalConfig] = useState<{ mode: "create" | "edit"; customer?: Customer | null } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvImportMessage, setCsvImportMessage] = useState<string | null>(null);
  const [csvImportError, setCsvImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const driveFileInputRef = useRef<HTMLInputElement | null>(null);
  const [vehicleModal, setVehicleModal] = useState<VehicleModalState | null>(null);
  const [vehicleSaving, setVehicleSaving] = useState(false);
  const [vehicleError, setVehicleError] = useState<string | null>(null);
  const [driveUploadError, setDriveUploadError] = useState<string | null>(null);
  const [driveUploadingId, setDriveUploadingId] = useState<string | null>(null);
  const [vehicleDocs, setVehicleDocs] = useState<Record<string, DriveFile | undefined>>({});
  const [vehicleDocsFolderId, setVehicleDocsFolderId] = useState<string | null>(null);
  const [viewerDoc, setViewerDoc] = useState<{ vehicleId: string; file: DriveFile } | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerMime, setViewerMime] = useState<string | null>(null);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerCustomer, setComposerCustomer] = useState<Customer | null>(null);

  const ensureVehicleDocsFolder = useCallback(async () => {
    const folders = await authorizedRequest<DriveFolder[]>("/drive/folders?scope=TEAM");
    const existing = folders.find(
      (folder) => folder.name.trim().toLowerCase() === VEHICLE_DOCS_FOLDER.toLowerCase(),
    );
    if (existing) {
      setVehicleDocsFolderId(existing.id);
      return existing.id;
    }

    const created = await authorizedRequest<DriveFolder>("/drive/folders", {
      method: "POST",
      body: JSON.stringify({ scope: "TEAM", name: VEHICLE_DOCS_FOLDER }),
    });
    setVehicleDocsFolderId(created.id);
    return created.id;
  }, [authorizedRequest]);

  const loadVehicleDocs = useCallback(async () => {
    setDriveUploadError(null);
    try {
      const folderId = await ensureVehicleDocsFolder();
      const response = await authorizedRequest<DriveFileListResponse>(
        `/drive/files?scope=TEAM&folderId=${folderId}&limit=100`,
      );
      const nextDocs: Record<string, DriveFile> = {};
      response.items.forEach((file) => {
        const vehicleId = parseVehicleDocVehicleId(file.name);
        if (!vehicleId) return;
        const existing = nextDocs[vehicleId];
        if (!existing) {
          nextDocs[vehicleId] = file;
          return;
        }
        const existingTime = new Date(existing.createdAt).getTime();
        const nextTime = new Date(file.createdAt).getTime();
        if (nextTime >= existingTime) {
          nextDocs[vehicleId] = file;
        }
      });
      setVehicleDocs(nextDocs);
    } catch (err) {
      setDriveUploadError(err instanceof Error ? err.message : "Fahrzeugscheine konnten nicht geladen werden.");
    }
  }, [authorizedRequest, ensureVehicleDocsFolder]);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof document === "undefined") return true;
    return document.documentElement.classList.contains("dark");
  });

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
        setError(err instanceof Error ? err.message : "API Fehler");
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
    if (tokens?.accessToken) {
      void loadVehicleDocs();
    }
    return () => controller.abort();
  }, [authLoading, fetchCustomers, loadVehicleDocs, tokens?.accessToken]);

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
    if (!data?.items.length || !selectedCustomerId) {
      return null;
    }
    return data.items.find((customer) => customer.id === selectedCustomerId) ?? data.items[0];
  }, [data, selectedCustomerId]);

  const stats = data?.stats ?? {
    total: 0,
    privateCustomers: 0,
    businessCustomers: 0,
    fleetCustomers: 0,
    openServiceOrders: 0,
    vehicles: 0,
  };

  const modalOpen = modalConfig !== null;
  const modalMode = modalConfig?.mode ?? "create";
  const modalCustomer = modalConfig?.customer ?? null;

  const handleCustomerSaved = useCallback(
    (customer: Customer) => {
      setSelectedCustomerId(customer.id);
      void fetchCustomers();
    },
    [fetchCustomers],
  );

  const openCreateModal = useCallback(() => {
    setModalConfig({ mode: "create" });
  }, []);

  const openEditModal = useCallback(() => {
    if (!activeCustomer) {
      return;
    }
    setModalConfig({ mode: "edit", customer: activeCustomer });
  }, [activeCustomer]);

  const openVehicleCreate = useCallback(() => {
    if (!activeCustomer) return;
    setVehicleError(null);
    setVehicleModal({ mode: "create" });
  }, [activeCustomer]);

  const openVehicleEdit = useCallback(
    (vehicle: Vehicle) => {
      if (!activeCustomer) return;
      setVehicleError(null);
      setVehicleModal({ mode: "edit", vehicle });
    },
    [activeCustomer],
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

  const handleCsvImport = useCallback(
    async (file: File) => {
      setCsvImportError(null);
      setCsvImportMessage(null);
      setCsvImporting(true);
      const formData = new FormData();
      formData.append("file", file);
      try {
        const response = await authorizedRequest<{ imported: number; skipped: number; errors: string[] }>("/customers/import", {
          method: "POST",
          body: formData,
        });
        setCsvImportMessage(`Importiert: ${response.imported} · Übersprungen: ${response.skipped}`);
        if (response.errors.length) {
          setCsvImportError(response.errors.join(" | "));
        }
        await fetchCustomers();
      } catch (err) {
        setCsvImportError(err instanceof Error ? err.message : "Import fehlgeschlagen.");
      } finally {
        setCsvImporting(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [authorizedRequest, fetchCustomers],
  );

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        void handleCsvImport(file);
      }
    },
    [handleCsvImport],
  );

  const handleCsvClick = () => {
    fileInputRef.current?.click();
  };

  const handleVehicleDocClick = (vehicleId: string) => {
    setDriveUploadError(null);
    setDriveUploadingId(vehicleId);
    driveFileInputRef.current?.click();
  };

  const handleVehicleDocChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !driveUploadingId) return;
    setDriveUploadError(null);
    setDriveUploadingId((prev) => prev);
    try {
      const folderId = vehicleDocsFolderId ?? (await ensureVehicleDocsFolder());
      const payload = new FormData();
      payload.set("scope", "TEAM");
      payload.set("folderId", folderId);
      payload.set("name", buildVehicleDocName(driveUploadingId, file.name));
      payload.append("file", file);
      const uploaded = await authorizedRequest<DriveFile>("/drive/files", {
        method: "POST",
        body: payload,
      });
      setVehicleDocs((prev) => ({ ...prev, [driveUploadingId]: uploaded }));
      setViewerDoc({ vehicleId: driveUploadingId, file: uploaded });
    } catch (err) {
      setDriveUploadError(err instanceof Error ? err.message : "Upload fehlgeschlagen.");
    } finally {
      setDriveUploadingId(null);
    }
  };

  useEffect(() => {
    if (!viewerDoc) {
      if (viewerUrl) {
        URL.revokeObjectURL(viewerUrl);
      }
      setViewerUrl(null);
      setViewerMime(null);
      setViewerError(null);
      setViewerLoading(false);
      return;
    }
    const load = async () => {
      if (!tokens?.accessToken) {
        setViewerError("Nicht eingeloggt.");
        return;
      }
      setViewerLoading(true);
      setViewerError(null);
      try {
        const response = await fetch(buildApiUrl(`/drive/files/${viewerDoc.file.id}/download`), {
          headers: authHeaders(tokens.accessToken),
        });
        if (!response.ok) {
          throw new Error(`Download fehlgeschlagen (${response.status})`);
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setViewerMime(blob.type || null);
        setViewerUrl(url);
      } catch (err) {
        setViewerError(err instanceof Error ? err.message : "Fahrzeugschein konnte nicht geladen werden.");
      } finally {
        setViewerLoading(false);
      }
    };
    void load();
    // cleanup handled above when viewerDoc changes/clears
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerDoc, tokens?.accessToken]);

  const openComposerForContact = (contact: CustomerContact) => {
    if (!activeCustomer) return;
    const reorderedContacts = [contact, ...activeCustomer.contacts.filter((c) => c.id !== contact.id)];
    setComposerCustomer({ ...activeCustomer, contacts: reorderedContacts });
    setComposerOpen(true);
  };

  const handleVehicleSubmit = useCallback(
    async (values: VehicleFormValues) => {
      if (!activeCustomer || !vehicleModal) return;
      setVehicleSaving(true);
      setVehicleError(null);

      const stringField = (value: string) => value.trim() || undefined;
      const payload: Record<string, unknown> = {
        manufacturer: stringField(values.manufacturer),
        model: stringField(values.model),
        trim: stringField(values.trim),
        licensePlate: stringField(values.licensePlate),
        vin: stringField(values.vin),
        color: stringField(values.color),
        notes: stringField(values.notes),
      };

      const yearValue = values.year.trim();
      if (yearValue) {
        const year = Number(yearValue);
        if (!Number.isNaN(year)) {
          payload.year = year;
        }
      }
      const mileageValue = values.mileageKm.trim();
      if (mileageValue) {
        const mileage = Number(mileageValue);
        if (!Number.isNaN(mileage)) {
          payload.mileageKm = mileage;
        }
      }
      if (values.fuelType) {
        payload.fuelType = values.fuelType;
      }
      if (values.transmission) {
        payload.transmission = values.transmission;
      }
      if (values.lastServiceAt) {
        payload.lastServiceAt = new Date(values.lastServiceAt).toISOString();
      }
      if (values.nextServiceAt) {
        payload.nextServiceAt = new Date(values.nextServiceAt).toISOString();
      }

      try {
        const endpoint =
          vehicleModal.mode === "edit" && vehicleModal.vehicle
            ? `/customers/${activeCustomer.id}/vehicles/${vehicleModal.vehicle.id}`
            : `/customers/${activeCustomer.id}/vehicles`;
        const method = vehicleModal.mode === "edit" ? "PATCH" : "POST";
        await authorizedRequest(endpoint, { method, body: JSON.stringify(payload) });
        await fetchCustomers();
        setVehicleModal(null);
      } catch (err) {
        setVehicleError(err instanceof Error ? err.message : "Fahrzeug konnte nicht gespeichert werden.");
      } finally {
        setVehicleSaving(false);
      }
    },
    [activeCustomer, authorizedRequest, fetchCustomers, vehicleModal],
  );

  const vehicleCount = activeCustomer?.vehicles?.length ?? 0;

  useEffect(() => {
    if (typeof document === "undefined") return;
    const update = () => setIsDarkMode(document.documentElement.classList.contains("dark"));
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="space-y-6 px-4 py-6 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Werkstatt</p>
          <h1 className="text-2xl font-semibold text-white">Kunden & Fahrzeuge</h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={openCreateModal} className="gap-2">
            <UserPlus className="h-4 w-4" />
            Neuer Kunde
          </Button>
          <Button variant="outline" onClick={handleCsvClick} disabled={csvImporting} className="gap-2 border-white/10 text-white hover:bg-white/10">
            <Upload className="h-4 w-4" />
            CSV Import
          </Button>
          <input ref={fileInputRef} type="file" accept=".csv" hidden onChange={handleFileChange} />
        </div>
      </div>

      {csvImportMessage && <p className="text-sm text-emerald-300">{csvImportMessage}</p>}
      {csvImportError && <p className="text-sm text-rose-300">{csvImportError}</p>}
      {error && <p className="text-sm text-rose-300">{error}</p>}

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="lg:w-[420px] lg:flex lg:flex-col">
          <div
            className={clsx(
              "rounded-[24px] border p-4 shadow-2xl lg:flex lg:flex-col",
              isDarkMode ? "border-white/10 bg-slate-950/70 text-white" : "border-slate-200 bg-white text-slate-900",
            )}
          >
            <div
              className={clsx(
                "flex items-center gap-2 rounded-2xl border px-3 py-2 text-slate-800 shadow-sm",
                isDarkMode ? "border-white/10 bg-slate-900/70 text-white" : "border-slate-200 bg-white text-slate-800",
              )}
            >
              <Search className={clsx("h-4 w-4", isDarkMode ? "text-slate-400" : "text-slate-500")} />
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Name, Kennzeichen, VIN ..."
                className={clsx(
                  "flex-1 bg-transparent text-sm placeholder:text-slate-400 focus:outline-none",
                  isDarkMode ? "text-white placeholder:text-slate-500" : "text-slate-800",
                )}
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
                      ? isDarkMode
                        ? "border-sky-400 bg-sky-500/30 text-white shadow-sm"
                        : "border-sky-500 bg-sky-500 text-white shadow-sm"
                      : isDarkMode
                        ? "border-white/10 bg-slate-900/60 text-slate-200 hover:border-sky-400/50"
                        : "border-slate-200 bg-white text-slate-700 hover:border-sky-400/60",
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div className="mt-4 space-y-3 max-h-[520px] overflow-y-auto pr-1">
              {loading && <p className={clsx("text-sm", isDarkMode ? "text-slate-300" : "text-slate-600")}>Lade Kunden ...</p>}
              {!loading && !data?.items.length && (
                <p className={clsx("text-sm", isDarkMode ? "text-slate-300" : "text-slate-600")}>Keine Kunden gefunden.</p>
              )}
              {data?.items.map((customer) => {
                const open =
                  (customer.serviceOrders ?? []).filter(
                    (order) => order.status === "IN_SERVICE" || order.status === "PLANNED",
                  ).length;
                return (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => setSelectedCustomerId(customer.id)}
                    className={clsx(
                      "w-full rounded-2xl border px-4 py-3 text-left transition",
                      selectedCustomerId === customer.id
                        ? isDarkMode
                          ? "border-sky-400 bg-sky-900/40 text-white shadow-md"
                          : "border-sky-500 bg-sky-50 text-slate-900 shadow-md"
                        : isDarkMode
                          ? "border-white/10 bg-slate-900/60 text-white hover:border-sky-400/50 hover:bg-slate-900/70"
                          : "border-slate-200 bg-white text-slate-900 hover:border-sky-400/50 hover:bg-sky-50",
                    )}
                  >
                    <p
                      className={clsx(
                        "flex items-center justify-between text-sm font-semibold",
                        isDarkMode ? "text-white" : "text-slate-900",
                    )}
                    >
                      <span>{customer.name}</span>
                      <span
                        className={clsx(
                          "text-xs uppercase tracking-[0.2em]",
                          isDarkMode ? "text-slate-300" : "text-slate-500",
                        )}
                      >
                        {customer.type}
                      </span>
                    </p>
                    <p className={clsx("text-xs", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                      Letzter Kontakt: {formatDate(customer.lastContactAt)}
                    </p>
                    <div
                      className={clsx("mt-2 flex flex-wrap gap-3 text-xs", isDarkMode ? "text-slate-300" : "text-slate-700")}
                    >
                      <span className="flex items-center gap-1">
                        <Car className={clsx("h-3.5 w-3.5", isDarkMode ? "text-slate-300" : "text-slate-500")} />
                        {(customer.vehicles ?? []).length} Fahrzeuge
                      </span>
                      <span className="flex items-center gap-1">
                        <Wrench className={clsx("h-3.5 w-3.5", isDarkMode ? "text-slate-300" : "text-slate-500")} />
                        {open} offen
                      </span>
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
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Kunde</p>
                    <h2 className="text-2xl font-semibold">{activeCustomer.name}</h2>
                    <p className="text-sm text-slate-300">
                      {activeCustomer.type === "PRIVATE"
                        ? "Privatkunde"
                        : activeCustomer.type === "BUSINESS"
                          ? "Gewerbekunde"
                          : "Flotte"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="outline" onClick={openEditModal} className="border-white/10 text-white">
                      Bearbeiten
                    </Button>
                    <Button variant="ghost" onClick={handleDeleteCustomer} disabled={deleteLoading} className="gap-2 text-rose-300">
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
                    {activeCustomer.street && (
                      <p className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-slate-400" />
                        {activeCustomer.street}, {activeCustomer.postalCode} {activeCustomer.city}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2 text-sm text-slate-200">
                    <p>Gesamtumsatz: {formatEuro(activeCustomer.totalSpendCents)}</p>
                    <p>Letzter Kontakt: {formatDate(activeCustomer.lastContactAt)}</p>
                    <p>Marketing Opt-in: {activeCustomer.marketingOptIn ? "Ja" : "Nein"}</p>
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
                {activeCustomer.notes && <p className="mt-4 text-sm text-slate-200">{activeCustomer.notes}</p>}
              </Card>

              {activeCustomer.contacts.length > 0 && (
                <Card className="border border-white/10 bg-white/5 p-5 text-white">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Kontakte</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-full border border-white/10 bg-white/5 px-3"
                      onClick={() => openEditModal()}
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
                            <div className="flex items-center gap-2">
                              {contact.role && (
                                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[12px] text-slate-200">
                                  {contact.role}
                                </span>
                              )}
                            </div>
                            <p className="mt-2 text-base font-semibold text-white">{contact.name}</p>
                          </div>
                          <div className="flex flex-wrap justify-end gap-2 text-[12px]">
                            {contact.channel && (
                              <span className="rounded-full bg-white/10 px-2 py-0.5 text-slate-200">{contact.channel}</span>
                            )}
                          </div>
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

              <Card
                className={clsx(
                  "border p-5 shadow-sm",
                  isDarkMode ? "border-white/10 bg-slate-950/60 text-white" : "border-slate-200 bg-white text-slate-900",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <p
                    className={clsx(
                      "text-xs uppercase tracking-[0.3em]",
                      isDarkMode ? "text-slate-300" : "text-slate-500",
                    )}
                  >
                    Fahrzeuge ({vehicleCount})
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {vehicleError && <p className="text-xs text-rose-300">{vehicleError}</p>}
                    {driveUploadError && <p className="text-xs text-rose-300">{driveUploadError}</p>}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-full border border-white/10 bg-white/5 px-3"
                      onClick={openVehicleCreate}
                    >
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Fahrzeug hinzufügen
                    </Button>
                  </div>
                </div>
                {vehicleCount === 0 ? (
                  <p className={clsx("mt-3 text-sm", isDarkMode ? "text-slate-300" : "text-slate-700")}>
                    Keine Fahrzeuge hinterlegt.
                  </p>
                ) : (
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    {activeCustomer.vehicles.map((vehicle) => (
                      <div
                        key={vehicle.id}
                        className={clsx(
                          "rounded-2xl border p-4 text-sm shadow-sm",
                          isDarkMode
                            ? "border-white/10 bg-slate-900/70 text-slate-100"
                            : "border-slate-200 bg-slate-50 text-slate-900",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className={clsx("text-base font-semibold", isDarkMode ? "text-white" : "text-slate-900")}>
                              {vehicle.licensePlate ?? "Ohne Kennzeichen"}
                            </p>
                            <p className={clsx(isDarkMode ? "text-slate-200" : "text-slate-700")}>
                              {[vehicle.manufacturer, vehicle.model, vehicle.trim].filter(Boolean).join(" ")}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {vehicle.year ? (
                              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-200">BJ {vehicle.year}</span>
                            ) : null}
                            {vehicleDocs[vehicle.id] ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="rounded-full border border-white/10 bg-white/5 px-3 text-xs"
                                onClick={() => setViewerDoc({ vehicleId: vehicle.id, file: vehicleDocs[vehicle.id]! })}
                              >
                                Fahrzeugschein anzeigen
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="rounded-full border border-white/10 bg-white/5 px-3 text-xs"
                                onClick={() => handleVehicleDocClick(vehicle.id)}
                                disabled={driveUploadingId === vehicle.id}
                              >
                                {driveUploadingId === vehicle.id ? (
                                  <span className="flex items-center gap-1">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Lädt...
                                  </span>
                                ) : (
                                  "Fahrzeugschein hochladen"
                                )}
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 rounded-full border border-white/10 bg-white/5"
                              onClick={() => openVehicleEdit(vehicle)}
                              aria-label="Fahrzeug bearbeiten"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className={clsx("mt-3 grid gap-3 text-xs sm:grid-cols-2", isDarkMode ? "text-slate-300" : "text-slate-700")}>
                          <div className="space-y-1">
                            <p className="text-[11px] uppercase tracking-[0.15em] text-slate-400">Kilometer</p>
                            <p className="rounded-xl bg-white/5 px-2 py-1">
                              {vehicle.mileageKm != null ? `${vehicle.mileageKm.toLocaleString("de-DE")} km` : "—"}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[11px] uppercase tracking-[0.15em] text-slate-400">VIN</p>
                            <p className="rounded-xl bg-white/5 px-2 py-1">{vehicle.vin || "—"}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[11px] uppercase tracking-[0.15em] text-slate-400">Kraftstoff</p>
                            <p className="rounded-xl bg-white/5 px-2 py-1">
                              {vehicle.fuelType ? formatFuelTypeLabel(vehicle.fuelType) : "—"}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[11px] uppercase tracking-[0.15em] text-slate-400">Getriebe</p>
                            <p className="rounded-xl bg-white/5 px-2 py-1">
                              {vehicle.transmission ? formatTransmissionLabel(vehicle.transmission) : "—"}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[11px] uppercase tracking-[0.15em] text-slate-400">Farbe</p>
                            <p className="rounded-xl bg-white/5 px-2 py-1">{vehicle.color || "—"}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[11px] uppercase tracking-[0.15em] text-slate-400">Service</p>
                            <p className="rounded-xl bg-white/5 px-2 py-1">
                              {vehicle.lastServiceAt ? `Letzter: ${formatDate(vehicle.lastServiceAt)}` : "Letzter: —"}
                              <br />
                              {vehicle.nextServiceAt ? `Nächster: ${formatDate(vehicle.nextServiceAt)}` : "Nächster: —"}
                            </p>
                          </div>
                        </div>
                        {vehicle.notes && (
                          <p className={clsx("mt-3 text-xs", isDarkMode ? "text-slate-300" : "text-slate-700")}>{vehicle.notes}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          ) : (
            <Card className="border border-dashed border-white/10 bg-transparent p-6 text-center text-slate-300">
              Bitte einen Kunden aus der Liste auswählen oder neu anlegen.
            </Card>
          )}
        </div>
      </div>

      {modalOpen && (
        <CustomerModal
          mode={modalMode}
          open={modalOpen}
          customer={modalCustomer}
          onClose={() => setModalConfig(null)}
          onSaved={handleCustomerSaved}
        />
      )}
      {vehicleModal && activeCustomer && (
        <VehicleFormModal
          open
          mode={vehicleModal.mode}
          vehicle={vehicleModal.vehicle ?? null}
          onClose={() => setVehicleModal(null)}
          onSubmit={handleVehicleSubmit}
          saving={vehicleSaving}
          error={vehicleError}
        />
      )}
      <input
        ref={driveFileInputRef}
        type="file"
        accept="image/*,.pdf"
        hidden
        onChange={handleVehicleDocChange}
      />
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
      {viewerDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 px-4">
          <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-950/90 p-6 text-slate-100 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Fahrzeugschein</p>
                <p className="text-lg font-semibold text-white">{viewerDoc.file.name}</p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9 rounded-full border border-white/10 bg-white/5"
                onClick={() => setViewerDoc(null)}
                aria-label="Schließen"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-white/5">
              {viewerLoading ? (
                <div className="flex h-[480px] items-center justify-center text-sm text-slate-300">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Lädt...
                </div>
              ) : viewerError ? (
                <div className="p-4 text-sm text-rose-300">{viewerError}</div>
              ) : (
                <div className="relative">
                  {viewerUrl ? (
                    viewerMime?.includes("pdf") ? (
                      <iframe title="Fahrzeugschein" src={viewerUrl} className="h-[480px] w-full max-w-full overflow-hidden" />
                    ) : (
                      <div className="flex h-[480px] w-full items-center justify-center bg-slate-900/40">
                        <img
                          src={viewerUrl}
                          alt="Fahrzeugschein"
                          className="max-h-[460px] max-w-full rounded-lg object-contain shadow"
                        />
                      </div>
                    )
                  ) : (
                    <div className="flex h-[480px] items-center justify-center text-sm text-slate-300">Keine Vorschau verfügbar.</div>
                  )}
                </div>
              )}
            </div>
            <div className="mt-3 flex justify-between text-sm text-slate-300">
              {viewerUrl ? (
                <a className="text-sky-400 hover:underline" href={viewerUrl} target="_blank" rel="noreferrer">
                  In neuem Tab öffnen
                </a>
              ) : (
                <span />
              )}
              <Button
                size="sm"
                variant="ghost"
                className="rounded-full border border-white/10 bg-white/5 px-3"
                onClick={async () => {
                  try {
                    await authorizedRequest(`/drive/files/${viewerDoc.file.id}`, { method: "DELETE" });
                    setVehicleDocs((prev) => {
                      const next = { ...prev };
                      delete next[viewerDoc.vehicleId];
                      return next;
                    });
                    setViewerDoc(null);
                  } catch (err) {
                    setDriveUploadError(err instanceof Error ? err.message : "Fahrzeugschein konnte nicht entfernt werden.");
                  }
                }}
              >
                Entfernen
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type VehicleFormValues = {
  manufacturer: string;
  model: string;
  trim: string;
  licensePlate: string;
  vin: string;
  year: string;
  mileageKm: string;
  fuelType: VehicleFuelType | "";
  transmission: VehicleTransmission | "";
  color: string;
  lastServiceAt: string;
  nextServiceAt: string;
  notes: string;
};

interface VehicleFormModalProps {
  open: boolean;
  mode: "create" | "edit";
  vehicle: Vehicle | null;
  onClose: () => void;
  onSubmit: (values: VehicleFormValues) => void;
  saving: boolean;
  error: string | null;
}

function VehicleFormModal({ open, mode, vehicle, onClose, onSubmit, saving, error }: VehicleFormModalProps) {
  const [form, setForm] = useState<VehicleFormValues>({
    manufacturer: "",
    model: "",
    trim: "",
    licensePlate: "",
    vin: "",
    year: "",
    mileageKm: "",
    fuelType: "",
    transmission: "",
    color: "",
    lastServiceAt: "",
    nextServiceAt: "",
    notes: "",
  });

  useEffect(() => {
    if (!open) return;
    if (vehicle) {
      setForm({
        manufacturer: vehicle.manufacturer ?? "",
        model: vehicle.model ?? "",
        trim: vehicle.trim ?? "",
        licensePlate: vehicle.licensePlate ?? "",
        vin: vehicle.vin ?? "",
        year: vehicle.year ? String(vehicle.year) : "",
        mileageKm: vehicle.mileageKm != null ? String(vehicle.mileageKm) : "",
        fuelType: (vehicle.fuelType as VehicleFuelType) ?? "",
        transmission: (vehicle.transmission as VehicleTransmission) ?? "",
        color: vehicle.color ?? "",
        lastServiceAt: vehicle.lastServiceAt ? toDateTimeInput(vehicle.lastServiceAt) : "",
        nextServiceAt: vehicle.nextServiceAt ? toDateTimeInput(vehicle.nextServiceAt) : "",
        notes: vehicle.notes ?? "",
      });
    } else {
      setForm({
        manufacturer: "",
        model: "",
        trim: "",
        licensePlate: "",
        vin: "",
        year: "",
        mileageKm: "",
        fuelType: "",
        transmission: "",
        color: "",
        lastServiceAt: "",
        nextServiceAt: "",
        notes: "",
      });
    }
  }, [open, vehicle]);

  if (!open) return null;

  const title = mode === "edit" ? "Fahrzeug bearbeiten" : "Fahrzeug hinzufügen";

  const handleChange = (field: keyof VehicleFormValues, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4 py-6">
      <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-slate-950/90 p-6 shadow-2xl backdrop-blur">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{title}</p>
            <h2 className="text-2xl font-semibold text-white">Fahrzeugdaten</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 p-2 text-slate-200 transition hover:border-white/30 hover:bg-white/5"
            aria-label="Schließen"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-sm text-slate-300">Kennzeichen</label>
              <Input value={form.licensePlate} onChange={(e) => handleChange("licensePlate", e.target.value)} placeholder="M-AB 1234" />
            </div>
            <div>
              <label className="text-sm text-slate-300">VIN</label>
              <Input value={form.vin} onChange={(e) => handleChange("vin", e.target.value)} placeholder="WVWZZZ..." />
            </div>
            <div>
              <label className="text-sm text-slate-300">Hersteller</label>
              <Input value={form.manufacturer} onChange={(e) => handleChange("manufacturer", e.target.value)} placeholder="Volkswagen" />
            </div>
            <div>
              <label className="text-sm text-slate-300">Modell</label>
              <Input value={form.model} onChange={(e) => handleChange("model", e.target.value)} placeholder="Golf" />
            </div>
            <div>
              <label className="text-sm text-slate-300">Ausstattung</label>
              <Input value={form.trim} onChange={(e) => handleChange("trim", e.target.value)} placeholder="GTI" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-slate-300">Baujahr</label>
                <Input value={form.year} onChange={(e) => handleChange("year", e.target.value)} placeholder="2020" />
              </div>
              <div>
                <label className="text-sm text-slate-300">Kilometerstand</label>
                <Input value={form.mileageKm} onChange={(e) => handleChange("mileageKm", e.target.value)} placeholder="56000" />
              </div>
            </div>
            <div>
              <label className="text-sm text-slate-300">Farbe</label>
              <Input value={form.color} onChange={(e) => handleChange("color", e.target.value)} placeholder="Blau" />
            </div>
            <div>
              <label className="text-sm text-slate-300">Kraftstoff</label>
              <select
                value={form.fuelType}
                onChange={(e) => handleChange("fuelType", e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
              >
                <option value="">–</option>
                {fuelTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-slate-300">Getriebe</label>
              <select
                value={form.transmission}
                onChange={(e) => handleChange("transmission", e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
              >
                <option value="">–</option>
                {transmissionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-slate-300">Letzter Service</label>
              <Input
                type="datetime-local"
                value={form.lastServiceAt}
                onChange={(e) => handleChange("lastServiceAt", e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-slate-300">Nächster Service</label>
              <Input
                type="datetime-local"
                value={form.nextServiceAt}
                onChange={(e) => handleChange("nextServiceAt", e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-slate-300">Notizen</label>
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => handleChange("notes", e.target.value)}
              placeholder="Service-Hinweise, Zustand, Besonderheiten ..."
            />
          </div>

          {error && <p className="text-xs text-rose-300">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving} className="rounded-full border border-white/10">
              Abbrechen
            </Button>
            <Button type="submit" disabled={saving} className="rounded-full px-4">
              {saving ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Speichern...
                </span>
              ) : mode === "edit" ? (
                "Aktualisieren"
              ) : (
                "Anlegen"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
