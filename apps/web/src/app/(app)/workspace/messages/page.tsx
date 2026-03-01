"use client";

import { Mail, RefreshCw, Trash2, Folder, CheckSquare, Square, X, RotateCcw, MapPin, Phone, User, Info } from "lucide-react";
import { clsx } from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";
import { ApiError } from "@/lib/api";
import type {
  Customer,
  CustomerExtractionResponse,
  CustomerExtractionSuggestion,
  ContactRequestExtractionResponse,
  ContactRequestExtractionSuggestion,
  CustomerListResponse,
  CustomerMessage,
  CustomerMessageListResponse,
  CustomerMessageStatus,
  Lead,
  LeadMessageListResponse,
  SmtpSettings,
} from "@/lib/types";

// Import new components
import { MailboxSidebar, Mailbox } from "./mailbox-sidebar";
import { MessageList } from "./message-list";
import { MessageView } from "./message-view";
import { ComposerModal } from "./composer-modal";
import type { CustomerFormState } from "../../customers/customer-modal";
import { CustomerModal } from "../../customers/customer-modal";

// Helper functions
export const timestampFormatter = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
});
export function formatTimestamp(value?: string | null) { if (!value) return ""; return timestampFormatter.format(new Date(value)); }
const compactListDateFormatter = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});
export function formatCompactListDate(value?: string | null) {
  if (!value) return "";
  const raw = compactListDateFormatter.format(new Date(value));
  return raw.replace(",", "").trim();
}
export function formatAttachmentSize(size?: number | null) { if (!size || size <= 0) return null; if (size < 1024) return `${size} B`; const kb = size / 1024; if (kb < 1024) return `${Math.round(kb)} KB`; return `${(kb / 1024).toFixed(1)} MB`; }
const toDateTimeInput = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 16);
};

export function detectUrgency(message?: CustomerMessage | null) {
  if (!message?.urgency) return null;
  if (message.urgency === "high") {
    return "Kritisch";
  }
  if (message.urgency === "medium") {
    return "Dringend";
  }
  return null;
}
export function getCategoryMeta(category?: CustomerMessage["category"]) {
  switch (category) {
    case "ANGEBOT":
      return { label: "Angebot", className: "bg-emerald-500/20 text-emerald-100" };
    case "KUENDIGUNG":
      return { label: "Kündigung", className: "bg-rose-500/20 text-rose-200" };
    case "KRITISCH":
      return { label: "Kritisch", className: "bg-red-500/25 text-red-100" };
    case "KOSTENVORANSCHLAG":
      return { label: "Kostenvoranschlag", className: "bg-indigo-500/20 text-indigo-100" };
    case "WERBUNG":
      return { label: "Werbung", className: "bg-amber-500/20 text-amber-100" };
    case "SONSTIGES":
      return { label: "Sonstiges", className: "bg-slate-500/20 text-slate-200" };
    default:
      return null;
  }
}
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value?: string | null) => !!value && uuidRegex.test(value);
type UnreadSummary = {
  leads: Record<string, number>;
  unassigned: number;
  contactRequests?: number;
  total: number;
};
type LeadMessage = CustomerMessage & { processedAt?: string | null };
const MESSAGE_COUNTS_KEY = "workspace/messages/unread-total";
const COMPOSER_OPEN_KEY = "workspace/messages/composer-open";
const FOLDER_STORAGE_KEY = "workspace/messages/folders";
const FOLDER_ASSIGNMENTS_KEY = "workspace/messages/folder-assignments";
const CONTACT_REQUEST_READ_KEY = "workspace/messages/contact-requests-read";
const countUnreadMessages = (items: CustomerMessage[]) =>
  items.filter((msg) => msg.direction === "INBOUND" && !msg.readAt).length;
const toTitleCase = (value?: string | null) =>
  value ? value.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : "";

const extractNameFromBody = (body?: string | null) => {
  if (!body) return "";
  const trimmed = body.trim();
  if (!trimmed) return "";
  const patterns = [
    /mit freundlichen grüßen[,:\-\s]*([^\n]+)/i,
    /beste[n]?\s+grüße[,:\-\s]*([^\n]+)/i,
    /viele\s+grüße[,:\-\s]*([^\n]+)/i,
    /grüße[,:\-\s]*([^\n]+)/i,
    /cheers[,:\-\s]*([^\n]+)/i,
    /thanks[,:\-\s]*([^\n]+)/i,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      return toTitleCase(match[1].trim().replace(/[^a-zA-ZäöüÄÖÜß\s\-']/g, ""));
    }
  }
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const candidate = lines[lines.length - 1] || "";
  if (candidate && candidate.length <= 50) {
    return toTitleCase(candidate.replace(/[^a-zA-ZäöüÄÖÜß\s\-']/g, ""));
  }
  return "";
};

const extractPhoneFromBody = (body?: string | null) => {
  if (!body) return "";
  const matches = body.match(/\+?\d[\d\s()./-]{6,}/g);
  if (!matches) return "";
  const cleaned = matches
    .map((m) => m.replace(/[^\d+]/g, ""))
    .filter((m) => m.length >= 8);
  if (!cleaned.length) return "";
  cleaned.sort((a, b) => b.length - a.length);
  return cleaned[0];
};


function prefillFromMessage(msg: CustomerMessage): Partial<CustomerFormState> {
  const fromEmail = msg.fromEmail?.trim() ?? "";
  const bodySource = msg.summary || msg.preview || msg.body || "";
  const nameFromBody = extractNameFromBody(bodySource);
  const contactName =
    msg.contact?.name?.trim() ||
    nameFromBody ||
    (() => {
      const local = fromEmail.split("@")[0] ?? "";
      return local ? toTitleCase(local.replace(/[._]/g, " ")) : "";
    })();
  const phone = extractPhoneFromBody(msg.body) || msg.contact?.phone?.trim() || "";
  const contactEmail = msg.contact?.email?.trim() || fromEmail || "";
  const summarySource = (msg.summary || msg.preview || msg.body || "").trim();
  const summary = summarySource
    ? `${summarySource.replace(/\s+/g, " ").slice(0, 200)}${summarySource.length > 200 ? "…" : ""}`
    : "";
  return {
    name: contactName || "Kontakt",
    email: fromEmail || msg.contact?.email?.trim() || "",
    phone,
    notes: summary || "Kontaktanfrage",
    contactName: contactName || "",
    contactEmail,
    contactPhone: phone,
  };
}

function suggestionToPrefill(
  suggestion?: CustomerExtractionSuggestion | null,
  fallbackNotes?: string | null,
): Partial<CustomerFormState> {
  if (!suggestion) {
    return {};
  }
  const prefill: Partial<CustomerFormState> = {};
  const customer = suggestion.customer ?? undefined;
  if (customer) {
    if (customer.name) prefill.name = customer.name;
    if (customer.type) prefill.type = customer.type;
    if (customer.email) prefill.email = customer.email;
    if (customer.phone) prefill.phone = customer.phone;
    if (customer.mobile) prefill.mobile = customer.mobile;
    if (customer.street) prefill.street = customer.street;
    if (customer.postalCode) prefill.postalCode = customer.postalCode;
    if (customer.city) prefill.city = customer.city;
    if (customer.preferredChannel) prefill.preferredChannel = customer.preferredChannel;
    if (typeof customer.marketingOptIn === "boolean") prefill.marketingOptIn = customer.marketingOptIn;
    if (customer.notes) prefill.notes = customer.notes;
    if (customer.tags?.length) prefill.tags = customer.tags.join(", ");
    if (customer.lastContactAt) prefill.lastContactAt = toDateTimeInput(customer.lastContactAt);
  }

  const contact = suggestion.contact ?? undefined;
  if (contact) {
    if (!prefill.name && contact.name) prefill.name = contact.name;
    if (!prefill.email && contact.email) prefill.email = contact.email;
    if (!prefill.phone && contact.phone) prefill.phone = contact.phone;
    if (contact.name) prefill.contactName = contact.name;
    if (contact.role) prefill.contactRole = contact.role;
    if (contact.email) prefill.contactEmail = contact.email;
    if (contact.phone) prefill.contactPhone = contact.phone;
    if (contact.channel) prefill.contactChannel = contact.channel;
  }

  const vehicle = suggestion.vehicle ?? undefined;
  if (vehicle) {
    if (vehicle.manufacturer) prefill.vehicleManufacturer = vehicle.manufacturer;
    if (vehicle.model) prefill.vehicleModel = vehicle.model;
    if (vehicle.trim) prefill.vehicleTrim = vehicle.trim;
    if (vehicle.licensePlate) prefill.vehicleLicensePlate = vehicle.licensePlate;
    if (vehicle.vin) prefill.vehicleVin = vehicle.vin;
    if (typeof vehicle.year === "number") prefill.vehicleYear = vehicle.year.toString();
    if (typeof vehicle.mileageKm === "number") prefill.vehicleMileageKm = vehicle.mileageKm.toString();
    if (vehicle.fuelType) prefill.vehicleFuelType = vehicle.fuelType;
    if (vehicle.transmission) prefill.vehicleTransmission = vehicle.transmission;
    if (vehicle.color) prefill.vehicleColor = vehicle.color;
    if (vehicle.notes) prefill.vehicleNotes = vehicle.notes;
  }

  if (!prefill.notes && fallbackNotes?.trim()) {
    prefill.notes = fallbackNotes.trim();
  }

  return prefill;
}

const buildLeadNotes = (lead?: Lead | null) => {
  const message = lead?.message?.trim() ?? "";
  if (!message) return "Kontaktanfrage";
  const compact = message.replace(/\s+/g, " ").trim();
  return compact.length > 200 ? `${compact.slice(0, 200)}…` : compact;
};

function prefillFromLead(lead?: Lead | null): Partial<CustomerFormState> {
  const name = lead?.fullName?.trim() || "Kontakt";
  const email = lead?.email?.trim() || "";
  const phone = lead?.phone?.trim() || "";
  return {
    name,
    email,
    phone,
    notes: buildLeadNotes(lead),
  };
}

function contactRequestSuggestionToPrefill(
  suggestion?: ContactRequestExtractionSuggestion | null,
  fallbackNotes?: string | null,
): Partial<CustomerFormState> {
  if (!suggestion) {
    return {};
  }
  const prefill: Partial<CustomerFormState> = {};
  if (suggestion.name) prefill.name = suggestion.name;
  if (suggestion.email) prefill.email = suggestion.email;
  if (suggestion.phone) prefill.phone = suggestion.phone;
  if (suggestion.concern) prefill.notes = suggestion.concern;

  if (!prefill.notes && fallbackNotes?.trim()) {
    prefill.notes = fallbackNotes.trim();
  }

  return prefill;
}


export default function MessagesWorkspacePage() {
  const { authorizedRequest, loading: authLoading, user, tokens } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  const customerIdFromUrl = searchParams.get("customerId");
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [contactRequests, setContactRequests] = useState<Lead[]>([]);
  const [hasLoadedLeads, setHasLoadedLeads] = useState(false);
  const [unassignedMessages, setUnassignedMessages] = useState<CustomerMessage[]>([]);
  const [inboxMessages, setInboxMessages] = useState<CustomerMessage[]>([]);
  const [sentMessages, setSentMessages] = useState<CustomerMessage[]>([]);
  const [spamMessages, setSpamMessages] = useState<CustomerMessage[]>([]);
  const [trashMessages, setTrashMessages] = useState<CustomerMessage[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [activeMailbox, setActiveMailbox] = useState<Mailbox>(customerIdFromUrl ? "customers" : "inbox");
  const [selectedId, setSelectedId] = useState<string | null>(customerIdFromUrl);
  const [search, setSearch] = useState("");

  const [threadMessages, setThreadMessages] = useState<CustomerMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const lastThreadKeyRef = useRef<string | null>(null);
  const contactReadsTenantRef = useRef<string | null>(null);

  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [messageToReplyTo, setMessageToReplyTo] = useState<CustomerMessage | null>(null);

  const [smtpReady, setSmtpReady] = useState(true);
  const [smtpStatus, setSmtpStatus] = useState<string | null>(null);
  const [unreadSummary, setUnreadSummary] = useState<UnreadSummary>({ leads: {}, unassigned: 0, contactRequests: 0, total: 0 });
  const [locallyReadContactRequests, setLocallyReadContactRequests] = useState<Set<string>>(new Set());
  const [folders, setFolders] = useState<string[]>([]);
  const [folderAssignments, setFolderAssignments] = useState<Record<string, string>>({});
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedBulkIds, setSelectedBulkIds] = useState<Set<string>>(new Set());
  const [bulkFolderTarget, setBulkFolderTarget] = useState("");
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerPrefill, setCustomerPrefill] = useState<Partial<CustomerFormState> | null>(null);
  const [extractingContactFor, setExtractingContactFor] = useState<string | null>(null);
  const [isContactInfoOpen, setIsContactInfoOpen] = useState(false);

  const persistUnreadSummaryRef = useRef(false);
  const lastPersistedSummaryRef = useRef<UnreadSummary | null>(null);
  const unassignedRef = useRef<CustomerMessage[]>([]);
  const inboxRef = useRef<CustomerMessage[]>([]);
  const sentRef = useRef<CustomerMessage[]>([]);
  const spamRef = useRef<CustomerMessage[]>([]);
  const trashRef = useRef<CustomerMessage[]>([]);

  const customersById = useMemo(() => {
    const map = new Map<string, Customer>();
    customers.forEach((customer) => {
      map.set(customer.id, customer);
    });
    return map;
  }, [customers]);

  const customerNamesByEmail = useMemo(() => {
    const map = new Map<string, { customerName: string; contactName?: string | null }>();
    customers.forEach((customer) => {
      if (customer.email?.trim()) {
        map.set(customer.email.trim().toLowerCase(), {
          customerName: customer.name,
          contactName: null,
        });
      }
      customer.contacts?.forEach((contact) => {
        if (!contact?.email) return;
        map.set(contact.email.toLowerCase(), { customerName: customer.name, contactName: contact.name });
      });
    });
    return map;
  }, [customers]);

  const contactSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const list: { id?: string; name?: string | null; email?: string | null; customerName?: string | null }[] = [];
    customers.forEach((customer) => {
      if (customer.email?.trim()) {
        const normalized = customer.email.trim().toLowerCase();
        if (!seen.has(normalized)) {
          seen.add(normalized);
          list.push({
            id: undefined,
            name: customer.name,
            email: normalized,
            customerName: customer.name,
          });
        }
      }
      customer.contacts?.forEach((contact) => {
        const email = contact.email?.trim().toLowerCase();
        if (!email || seen.has(email)) return;
        seen.add(email);
        list.push({
          id: contact.id,
          name: contact.name,
          email,
          customerName: customer.name,
        });
      });
    });
    return list;
  }, [customers]);

  const persistSummaryToStorage = useCallback((summary: UnreadSummary) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(MESSAGE_COUNTS_KEY, JSON.stringify(summary));
    window.dispatchEvent(
      new CustomEvent("workspace-messages-counts", {
        detail: { total: summary.total ?? 0, summary },
      }),
    );
  }, []);

  const normalizeUnreadSummary = useCallback((summary: UnreadSummary) => {
    const leads = summary.leads ?? {};
    const unassigned = Number.isFinite(summary.unassigned) ? Number(summary.unassigned) : 0;
    const contactRequests = Number.isFinite(summary.contactRequests) ? Number(summary.contactRequests) : 0;
    const totalFromComponents =
      Object.values(leads).reduce((acc, value) => acc + (Number.isFinite(value) ? Number(value) : 0), 0) +
      unassigned +
      contactRequests;
    const currentTotal = Number.isFinite(summary.total) ? Number(summary.total) : 0;
    const total = Math.max(currentTotal, totalFromComponents);
    return {
      ...summary,
      leads,
      unassigned,
      contactRequests,
      total,
    };
  }, []);

  const areUnreadSummariesEqual = useCallback((a: UnreadSummary, b: UnreadSummary) => {
    const contactA = Number.isFinite(a.contactRequests) ? Number(a.contactRequests) : 0;
    const contactB = Number.isFinite(b.contactRequests) ? Number(b.contactRequests) : 0;
    if (a.total !== b.total || a.unassigned !== b.unassigned || contactA !== contactB) {
      return false;
    }
    const leadsA = a.leads ?? {};
    const leadsB = b.leads ?? {};
    const keysA = Object.keys(leadsA);
    const keysB = Object.keys(leadsB);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (leadsA[key] !== leadsB[key]) return false;
    }
    return true;
  }, []);

  const applyUnreadSummary = useCallback(
    (next: UnreadSummary | ((prev: UnreadSummary) => UnreadSummary), persist = true) => {
      setUnreadSummary((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        const normalized = normalizeUnreadSummary(resolved);
        if (areUnreadSummariesEqual(prev, normalized)) {
          return prev;
        }
        persistUnreadSummaryRef.current = persist;
        return normalized;
      });
    },
    [areUnreadSummariesEqual, normalizeUnreadSummary],
  );

  const persistDisplaySummary = useCallback(
    (summary: UnreadSummary) => {
      const last = lastPersistedSummaryRef.current;
      if (last && areUnreadSummariesEqual(last, summary)) {
        return;
      }
      lastPersistedSummaryRef.current = summary;
      persistSummaryToStorage(summary);
    },
    [areUnreadSummariesEqual, persistSummaryToStorage],
  );

  const displayUnreadSummary = useMemo(() => {
    const baseContactRequests = Number.isFinite(unreadSummary.contactRequests)
      ? Number(unreadSummary.contactRequests)
      : 0;
    let localReadCount = 0;
    if (baseContactRequests > 0 && locallyReadContactRequests.size) {
      if (contactRequests.length) {
        contactRequests.forEach((lead) => {
          if (lead.processedAt) return;
          if (locallyReadContactRequests.has(lead.id)) localReadCount += 1;
        });
      } else {
        localReadCount = locallyReadContactRequests.size;
      }
    }
    const adjustedContactRequests = Math.max(0, baseContactRequests - localReadCount);
    const leadsTotal = Object.values(unreadSummary.leads ?? {}).reduce(
      (acc, value) => acc + (Number.isFinite(value) ? Number(value) : 0),
      0,
    );
    const unassigned = Number.isFinite(unreadSummary.unassigned)
      ? Number(unreadSummary.unassigned)
      : 0;
    const total = leadsTotal + unassigned + adjustedContactRequests;
    return {
      ...unreadSummary,
      contactRequests: adjustedContactRequests,
      total,
    };
  }, [contactRequests, locallyReadContactRequests, unreadSummary]);

  useEffect(() => {
    if (!persistUnreadSummaryRef.current) return;
    persistUnreadSummaryRef.current = false;
    persistDisplaySummary(displayUnreadSummary);
  }, [displayUnreadSummary, persistDisplaySummary]);

  useEffect(() => {
    if (!hasLoadedLeads) return;
    persistDisplaySummary(displayUnreadSummary);
  }, [displayUnreadSummary, hasLoadedLeads, persistDisplaySummary]);

  useEffect(() => {
    unassignedRef.current = unassignedMessages;
  }, [unassignedMessages]);

  useEffect(() => {
    inboxRef.current = inboxMessages;
  }, [inboxMessages]);

  useEffect(() => {
    sentRef.current = sentMessages;
  }, [sentMessages]);

  useEffect(() => {
    spamRef.current = spamMessages;
  }, [spamMessages]);
  useEffect(() => {
    trashRef.current = trashMessages;
  }, [trashMessages]);

  const onlyInbound = useCallback(
    (items: CustomerMessage[]) => items.filter((msg) => msg.direction === "INBOUND"),
    [],
  );

  // Restore composer open state after unexpected reloads
  useEffect(() => {
    if (typeof window === "undefined") return;
    const persisted = window.localStorage.getItem(COMPOSER_OPEN_KEY);
    if (persisted === "1") {
      setIsComposerOpen(true);
    }
  }, []);

  useEffect(() => {
    const syncFromStorage = () => {
      if (typeof window === "undefined") return;
      try {
        const raw = window.localStorage.getItem(MESSAGE_COUNTS_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as Partial<UnreadSummary>;
        const next: UnreadSummary = {
          leads: (parsed?.leads as Record<string, number>) ?? {},
          unassigned: Number.isFinite(parsed?.unassigned) ? Number(parsed?.unassigned) : 0,
          contactRequests: Number.isFinite(parsed?.contactRequests) ? Number(parsed?.contactRequests) : 0,
          total: Number.isFinite(parsed?.total) ? Number(parsed?.total) : 0,
        };
        applyUnreadSummary(next, false);
      } catch {
        // ignore parse errors
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === MESSAGE_COUNTS_KEY) {
        syncFromStorage();
      }
    };

    syncFromStorage();
    if (typeof window !== "undefined") {
      window.addEventListener("storage", handleStorage);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("storage", handleStorage);
      }
    };
  }, [applyUnreadSummary]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!user?.tenantId) {
      setFolders([]);
      setFolderAssignments({});
      return;
    }
    const foldersKey = `${FOLDER_STORAGE_KEY}/${user.tenantId}`;
    const assignmentsKey = `${FOLDER_ASSIGNMENTS_KEY}/${user.tenantId}`;
    try {
      const storedFolders = window.localStorage.getItem(foldersKey);
      const storedAssignments = window.localStorage.getItem(assignmentsKey);
      setFolders(storedFolders ? (JSON.parse(storedFolders) as string[]) : []);
      setFolderAssignments(storedAssignments ? (JSON.parse(storedAssignments) as Record<string, string>) : {});
    } catch {
      setFolders([]);
      setFolderAssignments({});
    }
  }, [user?.tenantId]);

  const persistFolders = useCallback(
    (nextFolders: string[], nextAssignments: Record<string, string>) => {
      if (typeof window === "undefined" || !user?.tenantId) return;
      const foldersKey = `${FOLDER_STORAGE_KEY}/${user.tenantId}`;
      const assignmentsKey = `${FOLDER_ASSIGNMENTS_KEY}/${user.tenantId}`;
      window.localStorage.setItem(foldersKey, JSON.stringify(nextFolders));
      window.localStorage.setItem(assignmentsKey, JSON.stringify(nextAssignments));
    },
    [user?.tenantId],
  );

  const persistContactRequestReads = useCallback(
    (reads: Set<string>) => {
      if (typeof window === "undefined" || !user?.tenantId) return;
      const readsKey = `${CONTACT_REQUEST_READ_KEY}/${user.tenantId}`;
      window.localStorage.setItem(readsKey, JSON.stringify(Array.from(reads)));
    },
    [user?.tenantId],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!user?.tenantId) {
      contactReadsTenantRef.current = null;
      setLocallyReadContactRequests(new Set());
      return;
    }
    const readsKey = `${CONTACT_REQUEST_READ_KEY}/${user.tenantId}`;
    try {
      const stored = window.localStorage.getItem(readsKey);
      const parsed = stored ? JSON.parse(stored) : null;
      const next = Array.isArray(parsed)
        ? new Set(parsed.filter((id) => typeof id === "string" && id.trim()))
        : new Set<string>();
      setLocallyReadContactRequests((prev) => {
        if (contactReadsTenantRef.current && contactReadsTenantRef.current !== user.tenantId) {
          return next;
        }
        if (!contactReadsTenantRef.current && prev.size === 0) {
          return next;
        }
        const merged = new Set(prev);
        next.forEach((id) => merged.add(id));
        return merged;
      });
      contactReadsTenantRef.current = user.tenantId;
    } catch {
      if (contactReadsTenantRef.current !== user.tenantId) {
        setLocallyReadContactRequests(new Set());
        contactReadsTenantRef.current = user.tenantId;
      }
    }
  }, [user?.tenantId]);

  useEffect(() => {
    if (!user?.tenantId || contactReadsTenantRef.current !== user.tenantId) return;
    persistContactRequestReads(locallyReadContactRequests);
  }, [locallyReadContactRequests, persistContactRequestReads, user?.tenantId]);

  useEffect(() => {
    if (!hasLoadedLeads) return;
    if (!locallyReadContactRequests.size) return;
    const allowed = new Set(
      contactRequests.filter((lead) => !lead.processedAt).map((lead) => lead.id),
    );
    setLocallyReadContactRequests((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (allowed.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [contactRequests, hasLoadedLeads, locallyReadContactRequests.size]);

  useEffect(() => {
    applyUnreadSummary((prev) => prev);
  }, [applyUnreadSummary, contactRequests, locallyReadContactRequests]);

  const fetchMailboxData = useCallback(async (customerId?: string | null) => {
    if (authLoading || !user || !tokens?.accessToken) return;
    setLoading(true);
    setError(null);

    const customerQuery = customerId ? `&customerId=${customerId}` : "";

    const spamRequest = authorizedRequest<CustomerMessage[]>(`/messages/spam?limit=50${customerQuery}`).catch((err) => {
      if (err instanceof ApiError && err.status === 404) {
        console.warn("Spam-Endpoint nicht verfügbar, verwende leere Liste.");
        return [];
      }
      throw err;
    });
    const trashRequest = authorizedRequest<CustomerMessage[]>(`/messages/trash?limit=50`).catch((err) => {
      console.warn("Papierkorb konnte nicht geladen werden", err);
      return [];
    });

    try {
      // If a customer ID is provided, we only fetch their messages
      if (customerId) {
        const [
          inboxResponse,
          sentResponse,
          spamResponse,
          trashResponse,
          customersResponse, // Fetch customer list to find the active one
        ] = await Promise.all([
          authorizedRequest<CustomerMessage[]>(`/messages/inbox?limit=50${customerQuery}`),
          authorizedRequest<CustomerMessage[]>(`/messages/sent?limit=50${customerQuery}`),
          spamRequest,
          trashRequest,
          authorizedRequest<CustomerListResponse>("/customers?limit=100"), // Fetch more to find the customer
        ]);

        setInboxMessages(onlyInbound(inboxResponse));
        setSentMessages(sentResponse);
        setSpamMessages(spamResponse);
        setTrashMessages(trashResponse ?? []);
        
        const allCustomers = customersResponse.items;
        const currentCustomer = allCustomers.find(c => c.id === customerId);
        setCustomers(currentCustomer ? [currentCustomer] : []);

        setLeads([]);
        setContactRequests([]);
        setUnassignedMessages([]);
        setHasLoadedLeads(false);

      } else {
         const [
          customersResponse,
          leadsResponse,
          inboxResponse,
          unassignedResponse,
          sentResponse,
          spamResponse,
          unreadResponse,
          trashResponse,
        ] = await Promise.all([
          authorizedRequest<CustomerListResponse>("/customers?limit=50"),
          authorizedRequest<Lead[]>("/leads?limit=50"),
          authorizedRequest<CustomerMessage[]>(`/messages/inbox?limit=50${customerQuery}`),
          authorizedRequest<CustomerMessage[]>(`/messages/unassigned?limit=50`),
          authorizedRequest<CustomerMessage[]>(`/messages/sent?limit=50${customerQuery}`),
          spamRequest,
          authorizedRequest<UnreadSummary>("/messages/unread-summary"),
          trashRequest,
        ]);

        const contactSources = new Set(["chatbot-callback", "contact-form"]);
        const callbackLeads = leadsResponse.filter((lead) => contactSources.has(lead.source ?? ""));
        const regularLeads = leadsResponse.filter((lead) => !contactSources.has(lead.source ?? ""));
        const contactUnread = callbackLeads.filter((lead) => !lead.processedAt).length;
        const contactRequestsTotal = Number.isFinite(unreadResponse.contactRequests)
          ? Number(unreadResponse.contactRequests)
          : contactUnread;
        setCustomers(customersResponse.items);
        setLeads(regularLeads);
        setContactRequests(callbackLeads);
        setHasLoadedLeads(true);
        setInboxMessages(onlyInbound(inboxResponse));
        setUnassignedMessages(onlyInbound(unassignedResponse));
        setSentMessages(sentResponse);
        setSpamMessages(spamResponse);
        setTrashMessages(trashResponse ?? []);
        const derivedUnread = countUnreadMessages(inboxResponse);
        applyUnreadSummary({
          ...unreadResponse,
          contactRequests: contactRequestsTotal,
          total: derivedUnread + contactRequestsTotal,
          unassigned: derivedUnread,
        });
      }

      const smtp = await authorizedRequest<SmtpSettings | null>("/settings/smtp");
      if (!smtp || !smtp.hasPassword) {
        setSmtpReady(false);
        setSmtpStatus("Bitte hinterlege deinen SMTP-Zugang unter Einstellungen.");
      } else {
        setSmtpReady(true);
        setSmtpStatus(null);
      }
    } catch (err) {
      setError("Daten konnten nicht geladen werden.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [applyUnreadSummary, authLoading, authorizedRequest, tokens?.accessToken, user]);

  useEffect(() => {
    void fetchMailboxData(customerIdFromUrl);
  }, [fetchMailboxData, customerIdFromUrl]);

  // Background refresh for unread counters without visible reloads
  useEffect(() => {
    if (authLoading || !user || !tokens?.accessToken) return;

    let mounted = true;
    const controller = new AbortController();

    const syncUnread = async () => {
      try {
        const summary = await authorizedRequest<UnreadSummary>(
          "/messages/unread-summary",
          { signal: controller.signal },
        );
        if (!mounted || !summary) return;

        const leads = summary.leads ?? {};
        const unassigned = Number.isFinite(summary.unassigned) ? summary.unassigned : 0;
        const contactRequests = Number.isFinite(summary.contactRequests) ? Number(summary.contactRequests) : 0;
        const computedTotal = Math.max(
          Number.isFinite(summary.total) ? summary.total : 0,
          unassigned + Object.values(leads).reduce((acc, value) => acc + (Number.isFinite(value) ? value : 0), 0) + contactRequests,
        );

        applyUnreadSummary({
          leads,
          unassigned,
          contactRequests,
          total: computedTotal,
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        console.warn("Unread summary refresh failed", err);
      }
    };

    void syncUnread();
    const interval = setInterval(syncUnread, 20000);

    return () => {
      mounted = false;
      controller.abort();
      clearInterval(interval);
    };
  }, [applyUnreadSummary, authLoading, authorizedRequest, tokens?.accessToken, user]);

  const leadToMessage = (lead: Lead): LeadMessage => ({
    id: lead.id,
    customerId: null,
    leadId: lead.id,
    contact: lead.fullName
      ? {
          id: lead.id,
          name: lead.fullName,
          email: lead.email ?? undefined,
          channel: lead.source === "chatbot-callback" ? "Caro" : "Kontaktformular",
        }
      : null,
    direction: "INBOUND",
    status: "SENT" as CustomerMessageStatus,
    subject: (() => {
      const firstLine = lead.message?.split(/\r?\n/)[0]?.trim();
      if (firstLine && !firstLine.toLowerCase().includes("neue anfrage über kontaktformular")) {
        return firstLine.slice(0, 120);
      }
      return lead.fullName || lead.email || "Ohne Betreff";
    })(),
    preview: lead.message?.trim() || undefined,
    body: lead.message ?? "",
    fromEmail: lead.email,
    toEmail: undefined,
    attachments: [],
    readAt: lead.processedAt ?? (locallyReadContactRequests.has(lead.id) ? new Date().toISOString() : null),
    processedAt: lead.processedAt ?? null,
    sentAt: null,
    receivedAt: lead.createdAt,
    createdAt: lead.createdAt,
    updatedAt: lead.createdAt,
  });

  // Nachrichtenauswertung via OpenAI ist aktuell deaktiviert, um unerwartete Refreshes zu vermeiden.
  
  const fetchMessagesByEmails = useCallback(
    async (emails: string[]) => {
      if (!emails.length) return [];
      const results = await Promise.all(
        emails.map((email) =>
          authorizedRequest<CustomerMessage[]>(
            `/messages/by-email?email=${encodeURIComponent(email)}`,
          ),
        ),
      );
      const seen = new Set<string>();
      const combined: CustomerMessage[] = [];
      results.forEach((items) => {
        items.forEach((msg) => {
          if (seen.has(msg.id)) return;
          seen.add(msg.id);
          combined.push(msg);
        });
      });
      combined.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      return combined;
    },
    [authorizedRequest],
  );

  const markMessagesRead = useCallback(
    async (messages: CustomerMessage[]) => {
      const unread = messages.filter(
        (msg) => msg.direction === "INBOUND" && !msg.readAt,
      );
      if (!unread.length) return;
      const ids = unread.map((msg) => msg.id).filter(Boolean);
      if (!ids.length) return;

      const serverIds = ids.filter((id) => isUuid(id));
      const now = new Date().toISOString();

      try {
        if (serverIds.length) {
          await authorizedRequest("/messages/read", {
            method: "POST",
            body: JSON.stringify({ ids: serverIds }),
          });
        }

        setThreadMessages((prev) =>
          prev.map((msg) => (ids.includes(msg.id) ? { ...msg, readAt: msg.readAt ?? now } : msg)),
        );
        setInboxMessages((prev) =>
          prev.map((msg) => (ids.includes(msg.id) ? { ...msg, readAt: msg.readAt ?? now } : msg)),
        );
        setUnassignedMessages((prev) =>
          prev.map((msg) => (ids.includes(msg.id) ? { ...msg, readAt: msg.readAt ?? now } : msg)),
        );
        setSentMessages((prev) =>
          prev.map((msg) => (ids.includes(msg.id) ? { ...msg, readAt: msg.readAt ?? now } : msg)),
        );
        setSpamMessages((prev) =>
          prev.map((msg) => (ids.includes(msg.id) ? { ...msg, readAt: msg.readAt ?? now } : msg)),
        );
        setTrashMessages((prev) =>
          prev.map((msg) => (ids.includes(msg.id) ? { ...msg, readAt: msg.readAt ?? now } : msg)),
        );
        applyUnreadSummary((prev) => {
          const nextLeads = { ...prev.leads };
          let nextUnassigned = prev.unassigned;
          unread.forEach((msg) => {
            if (msg.leadId && nextLeads[msg.leadId] !== undefined) {
              nextLeads[msg.leadId] = Math.max(0, nextLeads[msg.leadId] - 1);
            } else if (!msg.customerId && !msg.leadId) {
              nextUnassigned = Math.max(0, nextUnassigned - 1);
            }
          });
          const nextTotal = Math.max(0, prev.total - unread.length);
          return { ...prev, leads: nextLeads, unassigned: nextUnassigned, total: nextTotal };
        });
      } catch (err) {
        console.error("Mark read failed", err);
      }
    },
    [applyUnreadSummary, authorizedRequest],
  );

  const markLeadProcessed = useCallback(
    async (leadId: string) => {
      const exists =
        leads.some((lead) => lead.id === leadId) ||
        contactRequests.some((lead) => lead.id === leadId);
      if (!exists) {
        return;
      }
      const wasUnprocessed = contactRequests.some(
        (lead) => lead.id === leadId && !lead.processedAt,
      );
      try {
        const updated = await authorizedRequest<Lead>(`/leads/${leadId}/read`, {
          method: "PATCH",
        });
        setLeads((prev) =>
          prev.map((lead) => (lead.id === leadId ? { ...lead, processedAt: updated.processedAt } : lead)),
        );
        setContactRequests((prev) =>
          prev.map((lead) => (lead.id === leadId ? { ...lead, processedAt: updated.processedAt } : lead)),
        );
        setLocallyReadContactRequests((prev) => {
          if (!prev.has(leadId)) return prev;
          const next = new Set(prev);
          next.delete(leadId);
          return next;
        });
        if (wasUnprocessed) {
          applyUnreadSummary((prev) => {
            const nextContactRequests = Math.max(0, (prev.contactRequests ?? 0) - 1);
            const nextTotal = Math.max(0, prev.total - 1);
            return { ...prev, contactRequests: nextContactRequests, total: nextTotal };
          });
        }
      } catch (err) {
        console.error("Lead read update failed", err);
      }
    },
    [applyUnreadSummary, authorizedRequest, contactRequests, leads],
  );

  const markLeadViewed = useCallback((leadId: string) => {
    setLocallyReadContactRequests((prev) => {
      if (prev.has(leadId)) return prev;
      const next = new Set(prev);
      next.add(leadId);
      return next;
    });
  }, []);

  const mergeAndSortMessages = useCallback((lists: CustomerMessage[][]) => {
    const map = new Map<string, CustomerMessage>();
    lists.forEach((list) => {
      list?.forEach((msg) => {
        const existing = map.get(msg.id);
        if (!existing) {
          map.set(msg.id, msg);
          return;
        }
        const existingTs = new Date(existing.updatedAt ?? existing.createdAt ?? 0).getTime();
        const incomingTs = new Date(msg.updatedAt ?? msg.createdAt ?? 0).getTime();
        if (incomingTs >= existingTs) {
          map.set(msg.id, msg);
        }
      });
    });
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setThreadMessages([]);
      lastThreadKeyRef.current = null;
      return;
    }

    const threadKey = `${activeMailbox}:${selectedId}`;
    if (lastThreadKeyRef.current === threadKey) {
      return;
    }
    lastThreadKeyRef.current = threadKey;

    async function fetchThread() {
      if (!selectedId) return;
      const currentSelectedId = selectedId;
      setLoadingThread(true);
      setThreadError(null);
      let url = "";

      let itemType, rawId;
      const firstHyphenIndex = currentSelectedId.indexOf('-');

      if (firstHyphenIndex !== -1 && !isUuid(currentSelectedId)) {
        itemType = currentSelectedId.substring(0, firstHyphenIndex);
        rawId = currentSelectedId.substring(firstHyphenIndex + 1);
      } else {
        itemType = activeMailbox;
        rawId = currentSelectedId;
      }

      const findCustomerEmails = () => {
        if (activeMailbox !== "customers") return [];
        const customer = customers.find((c) => c.id === rawId);
        if (!customer) return [];
        const emails =
          customer.contacts
            ?.map((contact) => contact.email?.trim().toLowerCase() ?? null)
            .filter((email): email is string => Boolean(email)) ?? [];
        return Array.from(new Set(emails));
      };

    const mailboxKind = isFolderMailbox ? "inbox" : activeMailbox;

    if (mailboxKind === "customers") {
      const emails = findCustomerEmails();
      const requests: Promise<CustomerMessage[]>[] = [];

      if (emails.length) {
          requests.push(fetchMessagesByEmails(emails));
        }

        requests.push(
          authorizedRequest<CustomerMessageListResponse>(`/customers/${rawId}/messages`)
            .then((response) => response.items)
            .catch((err) => {
              if (err instanceof ApiError && err.status === 404) {
                return [];
              }
              throw err;
            }),
        );

        try {
          const results = await Promise.all(requests);
          const merged = mergeAndSortMessages(results);
          setThreadMessages(merged);
          setThreadError(null);
          await markMessagesRead(merged);
          if (rawId) {
            await markLeadProcessed(rawId);
          }
          return;
        } catch (err) {
          console.error(err);
          const localMatches = mergeAndSortMessages([
            inboxRef.current.filter((m) => m.customerId === rawId),
            unassignedRef.current.filter((m) => m.customerId === rawId),
            emails.length
              ? inboxRef.current.filter(
                  (m) =>
                    (m.toEmail && emails.includes(m.toEmail.toLowerCase())) ||
                    (m.fromEmail && emails.includes(m.fromEmail.toLowerCase())),
                )
              : [],
          ]);
          if (localMatches.length) {
            setThreadMessages(localMatches);
            setThreadError(null);
            await markMessagesRead(localMatches);
            return;
          }
          const message =
            err instanceof Error && err.message
              ? err.message
              : "Verlauf konnte nicht geladen werden.";
          setThreadError(message);
        } finally {
          setLoadingThread(false);
        }

        return;
      } else if (mailboxKind === "inbox" || mailboxKind === "contact-requests") {
          if (itemType === 'lead') {
            url = `/leads/${rawId}/messages`;
          } else if (mailboxKind === "inbox" && itemType === 'message') { 
            const clickedMessage = inboxRef.current.find(m => m.id === rawId);
        if (clickedMessage?.leadId) {
            url = `/leads/${clickedMessage.leadId}/messages`;
            } else if (clickedMessage?.customerId) {
                url = `/customers/${clickedMessage.customerId}/messages`;
            } else {
                const senderEmail = clickedMessage?.fromEmail;
                if (senderEmail) {
                    const emailMessages = await fetchMessagesByEmails([senderEmail]);
                    const thread = mergeAndSortMessages([emailMessages]);
                    setThreadMessages(thread);
                    await markMessagesRead(thread);
                    if (clickedMessage?.leadId) {
                      await markLeadProcessed(clickedMessage.leadId);
                    }
                } else {
                    const single = clickedMessage ? [clickedMessage] : [];
                    setThreadMessages(single);
                    await markMessagesRead(single);
                    if (clickedMessage?.leadId) {
                      await markLeadProcessed(clickedMessage.leadId);
                    }
                }
                setLoadingThread(false);
                return;
            }
          }
      }  else if (mailboxKind === 'sent' || mailboxKind === 'spam' || mailboxKind === 'trash') {
          const messageSource = mailboxKind === 'sent' ? sentRef.current : mailboxKind === 'spam' ? spamRef.current : trashRef.current;
          const message = messageSource.find(m => m.id === rawId);
          if (message?.leadId) {
            url = `/leads/${message.leadId}/messages`;
          } else if (message?.customerId) {
            url = `/customers/${message.customerId}/messages`;
          } else {
            if(message) {
              const single = [message];
              setThreadMessages(single);
              await markMessagesRead(single);
              if (message.leadId) {
                await markLeadProcessed(message.leadId);
              }
            }
              setLoadingThread(false);
              return;
            }
      }
      
      if (!url) {
        setLoadingThread(false);
        setThreadError("Verlauf konnte nicht gefunden werden.");
        return;
      }
      
      try {
        const response = await authorizedRequest<CustomerMessageListResponse | LeadMessageListResponse>(url);
        setThreadMessages(response.items);
        await markMessagesRead(response.items);
        if (activeMailbox === "inbox" && itemType === "lead") {
          await markLeadProcessed(rawId);
        }
      } catch (err) {
        const message =
          err instanceof Error && err.message
            ? err.message
            : "Verlauf konnte nicht geladen werden.";
        setThreadError(message);
      } finally {
        setLoadingThread(false);
      }
    }

    fetchThread();
  }, [selectedId, activeMailbox, authorizedRequest, customers, fetchMessagesByEmails, mergeAndSortMessages, markMessagesRead, markLeadProcessed]);

  const handleItemSelect = useCallback(
    (id: string) => {
      if (activeMailbox === "contact-requests" && id.startsWith("lead-")) {
        markLeadViewed(id.replace("lead-", ""));
      }
      setSelectedId(id);
    },
    [activeMailbox, markLeadViewed],
  );

  const handleMailboxChange = (mailbox: Mailbox) => {
    if (customerIdFromUrl) {
      router.push("/workspace/messages");
    }
    clearSelection();
    if (mailbox !== "contact-requests") {
      setIsContactInfoOpen(false);
    }
    setActiveMailbox(mailbox);
    setSelectedId(null);
    setSearch("");
    setThreadMessages([]);
    setMessageToReplyTo(null);
  };
  
  const handleMessageSent = (newMessage: CustomerMessage) => {
    if (selectedId) {
        setThreadMessages(prev => [newMessage, ...prev]);
    } else if(activeMailbox === 'inbox') {
        // This is tricky, we don't know if it's a lead or unassigned reply
    }
  };

  const handleCreateFolder = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setFolders((prev) => {
        if (prev.includes(trimmed)) return prev;
        const next = [...prev, trimmed];
        persistFolders(next, folderAssignments);
        return next;
      });
    },
    [folderAssignments, persistFolders],
  );

  const handleRenameFolder = useCallback(
    (prevName: string, nextName: string) => {
      const trimmed = nextName.trim();
      if (!trimmed || trimmed === prevName) return;
      setFolders((prev) => {
        if (!prev.includes(prevName)) return prev;
        if (prev.includes(trimmed)) return prev;
        const next = prev.map((f) => (f === prevName ? trimmed : f));
        setFolderAssignments((prevAssignments) => {
          const nextAssignments: Record<string, string> = {};
          Object.entries(prevAssignments).forEach(([msgId, folder]) => {
            nextAssignments[msgId] = folder === prevName ? trimmed : folder;
          });
          persistFolders(next, nextAssignments);
          return nextAssignments;
        });
        return next;
      });
    },
    [persistFolders],
  );

  const handleDeleteFolder = useCallback(
    (name: string) => {
      setFolders((prev) => {
        if (!prev.includes(name)) return prev;
        const next = prev.filter((f) => f !== name);
        setFolderAssignments((prevAssignments) => {
          const nextAssignments: Record<string, string> = {};
          Object.entries(prevAssignments).forEach(([msgId, folder]) => {
            if (folder !== name) nextAssignments[msgId] = folder;
          });
          persistFolders(next, nextAssignments);
          return nextAssignments;
        });
        if (activeMailbox === `folder:${name}`) {
          setActiveMailbox("inbox");
          setSelectedId(null);
        }
        return next;
      });
    },
    [activeMailbox, persistFolders],
  );

  const handleMoveFolder = useCallback(
    (name: string, direction: "up" | "down") => {
      setFolders((prev) => {
        const idx = prev.indexOf(name);
        if (idx === -1) return prev;
        const target = direction === "up" ? idx - 1 : idx + 1;
        if (target < 0 || target >= prev.length) return prev;
        const next = [...prev];
        [next[idx], next[target]] = [next[target], next[idx]];
        persistFolders(next, folderAssignments);
        return next;
      });
    },
    [folderAssignments, persistFolders],
  );

  const handleMoveToFolder = useCallback(
    (message: CustomerMessage, folderName: string) => {
      if (!folderName.trim()) return;
      if (message.direction !== "INBOUND") return;
      setFolders((prev) => {
        const nextFolders = prev.includes(folderName) ? prev : [...prev, folderName];
        setFolderAssignments((prevAssignments) => {
          const nextAssignments = { ...prevAssignments, [message.id]: folderName };
          persistFolders(nextFolders, nextAssignments);
          return nextAssignments;
        });
        return nextFolders;
      });
    },
    [persistFolders],
  );

  const selectableInboxItem = useCallback((item: InboxItem) => item.type === "message", []);
  const selectableContactRequestItem = useCallback((item: InboxItem) => item.type === "lead", []);

  const getSelectionId = useCallback(
    (item: InboxItem) => item.data.id,
    [],
  );

  const toggleSelectById = useCallback((id: string) => {
    if (!id) return;
    setSelectedBulkIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectItem = useCallback(
    (item: InboxItem) => {
      const id = getSelectionId(item);
      toggleSelectById(id);
    },
    [getSelectionId, toggleSelectById],
  );

  const clearSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedBulkIds(new Set());
    setBulkFolderTarget("");
  }, []);

  const handleBulkMoveToTrash = useCallback(async () => {
    const ids = Array.from(selectedBulkIds);
    if (!ids.length) return;
    const idSet = new Set(ids);
    const now = new Date().toISOString();
    setBulkProcessing(true);
    try {
      await authorizedRequest("/messages/trash", {
        method: "POST",
        body: JSON.stringify({ ids }),
      });
      const movedPool = [
        ...inboxRef.current,
        ...unassignedRef.current,
        ...spamRef.current,
        ...sentRef.current,
        ...trashRef.current,
      ].filter((msg) => idSet.has(msg.id));

      setInboxMessages((prev) => prev.filter((msg) => !idSet.has(msg.id)));
      setUnassignedMessages((prev) => prev.filter((msg) => !idSet.has(msg.id)));
      setSpamMessages((prev) => prev.filter((msg) => !idSet.has(msg.id)));
      setSentMessages((prev) => prev.filter((msg) => !idSet.has(msg.id)));
      setTrashMessages((prev) => {
        const map = new Map<string, CustomerMessage>();
        [...prev, ...movedPool.map((msg) => ({ ...msg, deletedAt: msg.deletedAt ?? now }))].forEach((msg) => {
          map.set(msg.id, { ...msg, deletedAt: msg.deletedAt ?? now });
        });
        return Array.from(map.values()).sort(
          (a, b) =>
            new Date(b.deletedAt ?? b.createdAt).getTime() -
            new Date(a.deletedAt ?? a.createdAt).getTime(),
        );
      });
      setFolderAssignments((prev) => {
        const next = { ...prev };
        ids.forEach((id) => {
          if (next[id]) delete next[id];
        });
        persistFolders(folders, next);
        return next;
      });
      applyUnreadSummary((prev) => {
        const unreadRemoved = movedPool.filter((msg) => msg.direction === "INBOUND" && !msg.readAt);
        if (!unreadRemoved.length) return prev;
        const leads = { ...prev.leads };
        let unassigned = prev.unassigned;
        unreadRemoved.forEach((msg) => {
          if (msg.leadId && leads[msg.leadId] !== undefined) {
            leads[msg.leadId] = Math.max(0, leads[msg.leadId] - 1);
          } else if (!msg.customerId && !msg.leadId) {
            unassigned = Math.max(0, unassigned - 1);
          }
        });
        const total = Math.max(0, prev.total - unreadRemoved.length);
        return { ...prev, leads, unassigned, total };
      });
      if (selectedId) {
        const normalized = selectedId.startsWith("message-") ? selectedId.replace("message-", "") : selectedId;
        if (idSet.has(normalized)) {
          setSelectedId(null);
          setThreadMessages([]);
        }
      }
      clearSelection();
    } catch (err) {
      console.error("Papierkorb verschieben fehlgeschlagen", err);
    } finally {
      setBulkProcessing(false);
    }
  }, [applyUnreadSummary, authorizedRequest, clearSelection, folders, persistFolders, selectedBulkIds, selectedId]);

  const handleSingleMoveToTrash = useCallback(
    async (message: CustomerMessage) => {
      try {
        await authorizedRequest("/messages/trash", {
          method: "POST",
          body: JSON.stringify({ ids: [message.id] }),
        });
        setInboxMessages((prev) => prev.filter((m) => m.id !== message.id));
        setUnassignedMessages((prev) => prev.filter((m) => m.id !== message.id));
        setSpamMessages((prev) => prev.filter((m) => m.id !== message.id));
        setSentMessages((prev) => prev.filter((m) => m.id !== message.id));
        setTrashMessages((prev) => [{ ...message, deletedAt: new Date().toISOString() }, ...prev]);
        if (selectedId === message.id) {
          setSelectedId(null);
          setThreadMessages([]);
        }
      } catch (err) {
        console.error("Papierkorb (einzeln) fehlgeschlagen", err);
      }
    },
    [authorizedRequest, selectedId],
  );

  const handleExtractContact = useCallback(
    async (message: CustomerMessage) => {
      const fallbackPrefill = prefillFromMessage(message);
      const openModal = (prefill: Partial<CustomerFormState>) => {
        setCustomerPrefill(prefill);
        setShowCustomerModal(true);
      };
      const fallback = () => {
        openModal(fallbackPrefill);
      };

      if (!message?.id) {
        fallback();
        return;
      }

      setExtractingContactFor(message.id);
      try {
        const response = await authorizedRequest<CustomerExtractionResponse>(
          `/messages/${message.id}/customer-extraction`,
          { method: "POST" },
        );
        const aiPrefill = suggestionToPrefill(
          response?.suggestion,
          fallbackPrefill.notes ?? null,
        );
        const mergedPrefill = { ...fallbackPrefill, ...aiPrefill };
        openModal(mergedPrefill);
      } catch (err) {
        console.error("Kundenanalyse fehlgeschlagen", err);
        fallback();
      } finally {
        setExtractingContactFor(null);
      }
    },
    [authorizedRequest],
  );

  const handleExtractContactRequest = useCallback(
    async (message: CustomerMessage, lead: Lead | null) => {
      const fallbackPrefill = prefillFromLead(lead);
      const openModal = (prefill: Partial<CustomerFormState>) => {
        setCustomerPrefill(prefill);
        setShowCustomerModal(true);
      };
      const fallback = () => {
        openModal(fallbackPrefill);
      };

      if (!lead?.id) {
        fallback();
        return;
      }

      setExtractingContactFor(message.id);
      try {
        const response = await authorizedRequest<ContactRequestExtractionResponse>(
          `/leads/${lead.id}/contact-extraction`,
          { method: "POST" },
        );
        const aiPrefill = contactRequestSuggestionToPrefill(
          response?.suggestion,
          fallbackPrefill.notes ?? null,
        );
        const mergedPrefill = { ...fallbackPrefill, ...aiPrefill };
        openModal(mergedPrefill);
      } catch (err) {
        console.error("Kontaktanfrage-Analyse fehlgeschlagen", err);
        fallback();
      } finally {
        setExtractingContactFor(null);
      }
    },
    [authorizedRequest],
  );

  const handleBulkMoveToFolder = useCallback(() => {
    const ids = Array.from(selectedBulkIds);
    const target = bulkFolderTarget.trim();
    if (!ids.length || !target) return;
    const idSet = new Set(ids);
    const pool = [...inboxMessages, ...unassignedMessages, ...spamMessages];
    const eligible = pool.filter((msg) => idSet.has(msg.id) && msg.direction === "INBOUND");
    if (!eligible.length) return;
    setFolders((prev) => {
      const nextFolders = prev.includes(target) ? prev : [...prev, target];
      setFolderAssignments((prevAssign) => {
        const nextAssign = { ...prevAssign };
        eligible.forEach((msg) => {
          nextAssign[msg.id] = target;
        });
        persistFolders(nextFolders, nextAssign);
        return nextAssign;
      });
      return nextFolders;
    });
  }, [bulkFolderTarget, inboxMessages, persistFolders, selectedBulkIds, spamMessages, unassignedMessages]);

  const handleBulkMarkContactProcessed = useCallback(async () => {
    const ids = Array.from(selectedBulkIds);
    if (!ids.length) return;
    const leadIds = ids.map((id) => (id.startsWith("lead-") ? id.replace("lead-", "") : id));
    const pending = contactRequests.filter((lead) => leadIds.includes(lead.id) && !lead.processedAt);
    if (!pending.length) {
      clearSelection();
      return;
    }
    setBulkProcessing(true);
    try {
      await Promise.all(pending.map((lead) => markLeadProcessed(lead.id)));
      clearSelection();
    } finally {
      setBulkProcessing(false);
    }
  }, [clearSelection, contactRequests, markLeadProcessed, selectedBulkIds]);

  const handleBulkDeleteContactRequests = useCallback(async () => {
    const ids = Array.from(selectedBulkIds);
    if (!ids.length) return;
    const leadIds = ids.map((id) => (id.startsWith("lead-") ? id.replace("lead-", "") : id));
    const toDelete = contactRequests.filter((lead) => leadIds.includes(lead.id));
    if (!toDelete.length) {
      clearSelection();
      return;
    }
    const deletedUnread = toDelete.filter((lead) => !lead.processedAt).length;
    setBulkProcessing(true);
    try {
      await Promise.all(
        toDelete.map((lead) =>
          authorizedRequest(`/leads/${lead.id}`, { method: "DELETE" }),
        ),
      );
      setContactRequests((prev) => prev.filter((lead) => !leadIds.includes(lead.id)));
      setLeads((prev) => prev.filter((lead) => !leadIds.includes(lead.id)));
      setLocallyReadContactRequests((prev) => {
        let changed = false;
        const next = new Set(prev);
        leadIds.forEach((id) => {
          if (next.delete(id)) {
            changed = true;
          }
        });
        return changed ? next : prev;
      });
      if (deletedUnread) {
        applyUnreadSummary((prev) => {
          const nextContactRequests = Math.max(0, (prev.contactRequests ?? 0) - deletedUnread);
          const nextTotal = Math.max(0, prev.total - deletedUnread);
          return { ...prev, contactRequests: nextContactRequests, total: nextTotal };
        });
      }
      if (selectedId) {
        const normalized = selectedId.startsWith("lead-")
          ? selectedId.replace("lead-", "")
          : selectedId;
        if (leadIds.includes(normalized)) {
          setSelectedId(null);
          setThreadMessages([]);
        }
      }
      clearSelection();
    } catch (err) {
      console.error("Kontaktanfragen löschen fehlgeschlagen", err);
    } finally {
      setBulkProcessing(false);
    }
  }, [applyUnreadSummary, authorizedRequest, clearSelection, contactRequests, selectedBulkIds, selectedId]);

  const handleDeleteContactRequest = useCallback(
    async (leadId: string) => {
      if (!leadId) return;
      const lead = contactRequests.find((entry) => entry.id === leadId);
      if (!lead) return;
      const deletedUnread = lead.processedAt ? 0 : 1;
      try {
        await authorizedRequest(`/leads/${leadId}`, { method: "DELETE" });
        setContactRequests((prev) => prev.filter((entry) => entry.id !== leadId));
        setLeads((prev) => prev.filter((entry) => entry.id !== leadId));
        setLocallyReadContactRequests((prev) => {
          if (!prev.has(leadId)) return prev;
          const next = new Set(prev);
          next.delete(leadId);
          return next;
        });
        if (deletedUnread) {
          applyUnreadSummary((prev) => {
            const nextContactRequests = Math.max(0, (prev.contactRequests ?? 0) - deletedUnread);
            const nextTotal = Math.max(0, prev.total - deletedUnread);
            return { ...prev, contactRequests: nextContactRequests, total: nextTotal };
          });
        }
        if (selectedId) {
          const normalized = selectedId.startsWith("lead-")
            ? selectedId.replace("lead-", "")
            : selectedId;
          if (normalized === leadId) {
            setSelectedId(null);
            setThreadMessages([]);
          }
        }
      } catch (err) {
        console.error("Kontaktanfrage löschen fehlgeschlagen", err);
      }
    },
    [applyUnreadSummary, authorizedRequest, contactRequests, selectedId],
  );

  const handleBulkRestoreFromTrash = useCallback(async () => {
    const ids = Array.from(selectedBulkIds);
    if (!ids.length) return;
    const idSet = new Set(ids);
    const toRestore = trashRef.current.filter((msg) => idSet.has(msg.id));
    if (!toRestore.length) return;
    setBulkProcessing(true);
    try {
      await authorizedRequest("/messages/trash/restore", {
        method: "POST",
        body: JSON.stringify({ ids }),
      });
      const restored = toRestore.map((msg) => ({ ...msg, deletedAt: null }));
      setTrashMessages((prev) => prev.filter((msg) => !idSet.has(msg.id)));

      setSpamMessages((prev) => {
        const map = new Map(prev.map((m) => [m.id, m]));
        restored
          .filter((m) => m.isSpam)
          .forEach((m) => map.set(m.id, m));
        return Array.from(map.values());
      });
      setSentMessages((prev) => {
        const map = new Map(prev.map((m) => [m.id, m]));
        restored
          .filter((m) => m.direction === "OUTBOUND")
          .forEach((m) => map.set(m.id, m));
        return Array.from(map.values());
      });
      setInboxMessages((prev) => {
        const map = new Map(prev.map((m) => [m.id, m]));
        restored
          .filter((m) => !m.isSpam)
          .forEach((m) => map.set(m.id, m));
        return Array.from(map.values());
      });
      setUnassignedMessages((prev) => {
        const map = new Map(prev.map((m) => [m.id, m]));
        restored
          .filter((m) => !m.isSpam && !m.customerId && !m.leadId && m.direction === "INBOUND")
          .forEach((m) => map.set(m.id, m));
        return Array.from(map.values());
      });

      applyUnreadSummary((prev) => {
        let total = prev.total;
        let unassigned = prev.unassigned;
        const leads = { ...prev.leads };
        restored.forEach((msg) => {
          if (msg.direction === "INBOUND" && !msg.readAt) {
            total += 1;
            if (msg.leadId) {
              leads[msg.leadId] = (leads[msg.leadId] ?? 0) + 1;
            } else if (!msg.customerId) {
              unassigned += 1;
            }
          }
        });
        return { ...prev, total, unassigned, leads };
      });

      if (selectedId) {
        const normalized = selectedId.startsWith("message-")
          ? selectedId.replace("message-", "")
          : selectedId;
        if (idSet.has(normalized)) {
          setSelectedId(null);
          setThreadMessages([]);
        }
      }
      clearSelection();
    } catch (err) {
      console.error("Wiederherstellen fehlgeschlagen", err);
    } finally {
      setBulkProcessing(false);
    }
  }, [applyUnreadSummary, authorizedRequest, clearSelection, selectedBulkIds, selectedId]);

  const isFolderMailbox = activeMailbox.startsWith("folder:");
  const activeFolder = isFolderMailbox ? activeMailbox.replace("folder:", "") : null;

  const folderUnread = useMemo(() => {
    const result: Record<string, number> = {};
    const pool = [...inboxMessages, ...unassignedMessages, ...spamMessages];
    pool.forEach((msg) => {
      const folderName = folderAssignments[msg.id];
      if (!folderName) return;
      if (msg.direction === "INBOUND" && !msg.readAt) {
        result[folderName] = (result[folderName] ?? 0) + 1;
      }
    });
    return result;
  }, [folderAssignments, inboxMessages, spamMessages, unassignedMessages]);

  const folderMessages = useMemo(() => {
    if (!activeFolder) return [];
    const pool = [...inboxMessages, ...unassignedMessages, ...spamMessages];
    const seen = new Set<string>();
    return pool.filter((msg) => {
      if (seen.has(msg.id)) return false;
      if (folderAssignments[msg.id] !== activeFolder) return false;
      seen.add(msg.id);
      return true;
    });
  }, [activeFolder, folderAssignments, inboxMessages, spamMessages, unassignedMessages]);

  type InboxItem = { id: string; type: "lead"; data: LeadMessage } | { id: string; type: "message"; data: CustomerMessage };
  type ListItem = InboxItem | Customer | Lead | CustomerMessage;

  const filteredItems = useMemo(() => {
    const lowerSearch = search.toLowerCase();
    
    let source: ListItem[] = [];
    if (activeMailbox === "inbox") {
        const leadItems: InboxItem[] = leads.map((lead) => ({
          id: `lead-${lead.id}`,
          type: "lead",
          data: leadToMessage(lead),
        }));
        const inboxItems: InboxItem[] = inboxMessages
          .filter(Boolean)
          .map((msg) => ({ id: `message-${msg.id}`, type: "message", data: msg }));
        const unassignedItems: InboxItem[] = unassignedMessages
          .filter(Boolean)
          .map((msg) => ({ id: `message-${msg.id}`, type: "message", data: msg }));
        const seen = new Set<string>();
        const merged = [...leadItems, ...inboxItems, ...unassignedItems].filter((item) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });
        source = merged;
    }
    else if (activeMailbox === "contact-requests") {
        const contactItems: InboxItem[] = contactRequests.map((lead) => ({
          id: `lead-${lead.id}`,
          type: "lead",
          data: leadToMessage(lead),
        }));
        source = contactItems;
    }
    else if (activeMailbox === "customers") source = customers;
    else if (activeMailbox === "sent") source = sentMessages;
    else if (activeMailbox === "spam") source = spamMessages;
    else if (activeMailbox === "trash") source = trashMessages;
    else if (isFolderMailbox && activeFolder) {
      const folderItems: InboxItem[] = folderMessages.map((msg) => ({
        id: `message-${msg.id}`,
        type: "message",
        data: msg,
      }));
      source = folderItems;
    }
    else return [];

    const sorted = [...source].sort((a, b) => {
        const dataA = "data" in a ? a.data : a;
        const dataB = "data" in b ? b.data : b;
        const dateA = (data: unknown) => {
          if (data && typeof (data as CustomerMessage).createdAt === "string") {
            const message = data as CustomerMessage;
            return (
              message.deletedAt ??
              message.receivedAt ??
              message.sentAt ??
              message.createdAt
            );
          }
          return (data as Customer)?.lastContactAt ?? null;
        };
        const dateValueA = dateA(dataA);
        const dateValueB = dateA(dataB);
        return new Date(dateValueB ?? 0).getTime() - new Date(dateValueA ?? 0).getTime();
    });

    if (!lowerSearch) return sorted;
    return sorted.filter((item) => {
        const data = "data" in item ? item.data : item;
        if ("name" in data && typeof data.name === "string") return data.name.toLowerCase().includes(lowerSearch);
        if ("fullName" in data && typeof data.fullName === "string") return data.fullName.toLowerCase().includes(lowerSearch);
        if ("subject" in data && typeof (data as CustomerMessage).subject === "string" && (data as CustomerMessage).subject) return (data as CustomerMessage).subject!.toLowerCase().includes(lowerSearch);
        if ("fromEmail" in data && typeof (data as CustomerMessage).fromEmail === "string" && (data as CustomerMessage).fromEmail) return (data as CustomerMessage).fromEmail!.toLowerCase().includes(lowerSearch);
        return false;
    });
  }, [search, activeMailbox, activeFolder, contactRequests, customers, leads, inboxMessages, sentMessages, spamMessages, trashMessages, unassignedMessages, folderMessages, isFolderMailbox, locallyReadContactRequests]);
  
  const renderInboxItem = (
    item: InboxItem,
    isActive: boolean,
    selectionInfo?: { selectable: boolean; selected: boolean; selectionActive: boolean },
  ) => {
    const selectable = Boolean(selectionInfo?.selectable);
    return renderUnassignedItem(item.data, isActive, {
      isSelected: Boolean(selectable && selectionInfo?.selected),
      selectionActive: Boolean(selectable && selectionInfo?.selectionActive),
      onToggle: selectable ? () => toggleSelectItem(item) : undefined,
    });
  };
  const renderCustomerItem = (item: Customer, isActive: boolean, _selection?: unknown) => {
    const primaryContact = item.contacts?.find((contact) => contact.email?.trim()) ?? item.contacts?.[0];
    const email = item.email?.trim() || primaryContact?.email?.trim() || "Keine E-Mail hinterlegt";
    const phone = item.phone?.trim() || primaryContact?.phone?.trim();
    const responsible = primaryContact?.name?.trim() || "Kein Ansprechpartner";
    const typeMeta = item.type === "BUSINESS"
      ? { label: "Business", pillClass: "border-sky-400/40 bg-sky-500/20 text-sky-100", accentClass: "bg-sky-400/70" }
      : item.type === "FLEET"
      ? { label: "Flotte", pillClass: "border-emerald-400/40 bg-emerald-500/20 text-emerald-100", accentClass: "bg-emerald-400/70" }
      : { label: "Privat", pillClass: "border-white/20 bg-white/10 text-slate-200", accentClass: "bg-white/40" };
    const lastContact = item.lastContactAt ? formatCompactListDate(item.lastContactAt) : null;
    const vehiclesCount = item.vehicles?.length ?? 0;
    const serviceOrdersCount = item.serviceOrders?.length ?? 0;
    const hasStats = vehiclesCount > 0 || serviceOrdersCount > 0;

    return (
      <div
        className={clsx(
          "group relative flex flex-col rounded-3xl border px-5 py-4 text-left transition",
          isActive
            ? "border-sky-400/60 bg-sky-400/10 shadow-[0_20px_60px_-35px_rgba(14,165,233,0.5)]"
            : "border-white/10 bg-white/5 hover:border-white/30 hover:bg-white/10",
        )}
      >
        <div className={clsx("absolute left-0 top-5 h-[calc(100%-2.5rem)] w-1 rounded-full", typeMeta.accentClass)} />
        <div className="space-y-3 pl-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="truncate text-base font-semibold text-white">{item.name}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                {item.city && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> {item.city}
                  </span>
                )}
                <span className="text-slate-500">{lastContact ? `Zuletzt ${lastContact}` : "Noch kein Kontakt"}</span>
              </div>
            </div>
            <span className={clsx("rounded-full border px-3 py-1 text-xs uppercase tracking-[0.2em]", typeMeta.pillClass)}>
              {typeMeta.label}
            </span>
          </div>
          <div className="grid gap-2 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-slate-400" />
              <span className="truncate">{email}</span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 text-slate-400" />
              <span className="truncate">{phone ?? "–"}</span>
            </div>
            <div className="flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-slate-400" />
              <span className="truncate">{responsible}</span>
            </div>
          </div>
        </div>
        {hasStats && (
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-300">
            {vehiclesCount > 0 && (
              <span className="rounded-full bg-white/10 px-2 py-0.5">Fahrzeuge {vehiclesCount}</span>
            )}
            {serviceOrdersCount > 0 && (
              <span className="rounded-full bg-white/10 px-2 py-0.5">Aufträge {serviceOrdersCount}</span>
            )}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-300">
          {item.tags?.length
            ? item.tags.slice(0, 4).map((tag) => (
                <span key={tag} className="rounded-full bg-white/10 px-2 py-0.5">
                  {tag}
                </span>
              ))
            : (
                <span className="text-slate-500">Keine Tags</span>
              )}
        </div>
      </div>
    );
  };
  const renderLeadItem = (item: Lead, isActive: boolean, _selection?: unknown) => {
    const unreadCount = displayUnreadSummary.leads[item.id] ?? 0;
    const isUnreadLead = unreadCount > 0;
    return (
      <div className={clsx("w-full rounded-2xl border px-4 py-3 text-left", isActive ? "border-white/30 bg-white/10" : "border-white/10 text-slate-300 hover:border-white/20")}>
        <p className="font-semibold text-white">{item.fullName}</p>
        <div className="mt-1 flex items-center gap-2">
          <p className="text-xs text-slate-400">{item.email}</p>
          {isUnreadLead && <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-200">Neu</span>}
        </div>
      </div>
    );
  };
  
  const resolveSenderDisplay = useCallback(
    (item: CustomerMessage) => {
      const primaryEmail = (item.fromEmail || item.contact?.email || "").trim();
      const lookupKey = primaryEmail.toLowerCase();
      const mapped = lookupKey ? customerNamesByEmail.get(lookupKey) : undefined;
      let mappedName = mapped?.contactName?.trim() || mapped?.customerName;
      if (!mappedName && item.customerId) {
        const customer = customersById.get(item.customerId);
        if (customer) mappedName = customer.name;
      }

      const label =
        item.contact?.name?.trim() ||
        mappedName ||
        primaryEmail ||
        item.contact?.email ||
        "Unbekannt";
      const email = primaryEmail || item.contact?.email || undefined;

      return { label, email };
    },
    [customerNamesByEmail, customersById],
  );

  const renderUnassignedItem = (
    item: CustomerMessage,
    isActive: boolean,
    selectionState?: { isSelected: boolean; selectionActive: boolean; onToggle?: () => void },
  ) => {
    if (!item) return null;
    const isLeadPlaceholder = Boolean(item.leadId && item.id === item.leadId);
    const leadProcessedAt = isLeadPlaceholder ? (item as LeadMessage).processedAt : null;
    const isUnread = item.direction === "INBOUND" && !item.readAt && !leadProcessedAt;
    const isProcessedLead = isLeadPlaceholder && Boolean(leadProcessedAt);
    const timestamp = formatCompactListDate(item.receivedAt ?? item.sentAt ?? item.createdAt);
    const urgency = detectUrgency(item);
    const categoryMeta = getCategoryMeta(item.category);
    const { label: fromLabel, email: fromEmail } = resolveSenderDisplay(item);
    const teaserSource = item.preview?.trim() || item.summary?.trim() || item.body || "";
    const teaser = teaserSource.replace(/\s+/g, " ").trim();
    const teaserDisplay = teaser.length > 140 ? `${teaser.slice(0, 140)}…` : teaser;
    return (
      <div className="relative">
        {selectionState?.selectionActive && (
          <button
            type="button"
            aria-label={selectionState.isSelected ? "Abwählen" : "Auswählen"}
            onClick={(e) => {
              e.stopPropagation();
              selectionState.onToggle?.();
            }}
            className={clsx(
              "absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border text-slate-100 transition",
              selectionState.isSelected
                ? "border-emerald-400/60 bg-emerald-500/20"
                : "border-white/10 bg-white/5 hover:border-white/30",
            )}
          >
            {selectionState.isSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
          </button>
        )}
      <div
        className={clsx(
          "w-full rounded-2xl border px-4 py-3 text-left",
          selectionState?.selectionActive ? "pl-12" : "",
          isActive ? "border-white/30 bg-white/10" : "border-white/10 text-slate-300 hover:border-white/20",
        )}
      >
        <div className="grid grid-cols-[minmax(140px,0.9fr)_minmax(0,1.7fr)_auto] items-center gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <p className="truncate font-semibold text-white">{fromLabel}</p>
              {isUnread && !isProcessedLead && (
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-200">
                  Neu
                </span>
              )}
              {isProcessedLead && (
                <span className="rounded-full bg-slate-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-200">
                  Bearbeitet
                </span>
              )}
            </div>
            {fromEmail && fromEmail !== fromLabel && (
              <p className="truncate text-xs text-slate-400">{fromEmail}</p>
            )}
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold text-white">{item.subject || "Ohne Betreff"}</p>
              {categoryMeta && (
                <span
                  className={clsx(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                    categoryMeta.className,
                  )}
                >
                  {categoryMeta.label}
                </span>
              )}
              {urgency && (
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-200">
                  {urgency}
                </span>
              )}
            </div>
            {teaserDisplay && <p className="truncate text-xs text-slate-400">{teaserDisplay}</p>}
          </div>
          <div className="ml-auto text-right text-xs text-slate-400 tabular-nums">{timestamp}</div>
        </div>
      </div>
      </div>
    );
  };

  const renderSentItem = (
    item: CustomerMessage,
    isActive: boolean,
    _selection?: { selectable: boolean; selected: boolean; selectionActive: boolean },
  ) => {
    const timestamp = formatCompactListDate(item.sentAt ?? item.createdAt);
    const teaserSource = item.preview?.trim() || item.summary?.trim() || item.body || "";
    const teaser = teaserSource.replace(/\s+/g, " ").trim();
    const teaserDisplay = teaser.length > 140 ? `${teaser.slice(0, 140)}…` : teaser;
    return (
      <div className="relative">
        {_selection?.selectionActive && (
          <button
            type="button"
            aria-label={_selection.selected ? "Abwählen" : "Auswählen"}
            onClick={(e) => {
              e.stopPropagation();
              if (_selection.selectable) {
                toggleSelectById(item.id);
              }
            }}
            className={clsx(
              "absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border text-slate-100 transition",
              _selection.selected
                ? "border-emerald-400/60 bg-emerald-500/20"
                : "border-white/10 bg-white/5 hover:border-white/30",
            )}
          >
            {_selection.selected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
          </button>
        )}
        <div
          className={clsx(
            "w-full rounded-2xl border px-4 py-3 text-left",
            _selection?.selectionActive ? "pl-12" : "",
            isActive ? "border-white/30 bg-white/10" : "border-white/10 text-slate-300 hover:border-white/20",
          )}
        >
          <div className="grid grid-cols-[minmax(140px,0.9fr)_minmax(0,1.7fr)_auto] items-center gap-3">
            <div className="min-w-0 space-y-1">
              <p className="truncate text-sm font-semibold text-white">{`An: ${item.toEmail ?? "Unbekannt"}`}</p>
              {item.fromEmail && <p className="truncate text-xs text-slate-400">{item.fromEmail}</p>}
            </div>
            <div className="min-w-0 space-y-1">
              <p className="truncate text-sm font-semibold text-white">{item.subject || "Ohne Betreff"}</p>
              {teaserDisplay && <p className="truncate text-xs text-slate-400">{teaserDisplay}</p>}
            </div>
            <div className="ml-auto text-right text-xs text-slate-400 tabular-nums">{timestamp}</div>
          </div>
        </div>
      </div>
    );
  };
  
  const renderSpamItem = (
    item: CustomerMessage,
    isActive: boolean,
    _selection?: { selectable: boolean; selected: boolean; selectionActive: boolean },
  ) => {
    const timestamp = formatTimestamp(item.receivedAt ?? item.createdAt);
    const categoryMeta = getCategoryMeta(item.category);
    return (
      <div className="relative">
        {_selection?.selectionActive && (
          <button
            type="button"
            aria-label={_selection.selected ? "Abwählen" : "Auswählen"}
            onClick={(e) => {
              e.stopPropagation();
              if (_selection.selectable) {
                toggleSelectById(item.id);
              }
            }}
            className={clsx(
              "absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border text-slate-100 transition",
              _selection.selected
                ? "border-emerald-400/60 bg-emerald-500/20"
                : "border-white/10 bg-white/5 hover:border-white/30",
            )}
          >
            {_selection.selected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
          </button>
        )}
        <div
          className={clsx(
            "w-full rounded-2xl border px-4 py-3 text-left",
            _selection?.selectionActive ? "pl-12" : "",
            isActive ? "border-white/30 bg-white/10" : "border-white/10 text-slate-300 hover:border-white/20",
          )}
        >
          <div className="flex items-center gap-2">
            <p className="font-semibold text-white truncate">{item.subject || "Ohne Betreff"}</p>
            {categoryMeta && (
              <span
                className={clsx(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                  categoryMeta.className,
                )}
              >
                {categoryMeta.label}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400">{item.fromEmail ?? "Kein Absender"}</p>
          <p className="mt-1 text-xs text-slate-500">{timestamp}</p>
        </div>
      </div>
    );
  };

  const renderTrashItem = (
    item: CustomerMessage,
    isActive: boolean,
    selection?: { selectable: boolean; selected: boolean; selectionActive: boolean },
  ) => {
    return renderUnassignedItem(item, isActive, {
      isSelected: Boolean(selection?.selected),
      selectionActive: Boolean(selection?.selectionActive),
      onToggle: selection?.selectable
        ? () => {
            const id = item.id;
            setSelectedBulkIds((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            });
          }
        : undefined,
    });
  };

  type RenderFn = (
    item: unknown,
    isActive: boolean,
    selection?: { selectable: boolean; selected: boolean; selectionActive: boolean },
  ) => React.ReactNode;

  const renderMap: Record<string, RenderFn> = {
    inbox: (item, isActive, selection) => renderInboxItem(item as InboxItem, isActive, selection),
    "contact-requests": (item, isActive, selection) =>
      renderInboxItem(item as InboxItem, isActive, selection),
    customers: (item, isActive) => renderCustomerItem(item as Customer, isActive),
    sent: (item, isActive, selection) => renderSentItem(item as CustomerMessage, isActive, selection),
    spam: (item, isActive, selection) => renderSpamItem(item as CustomerMessage, isActive, selection),
    trash: (item, isActive, selection) => renderTrashItem(item as CustomerMessage, isActive, selection),
  };
  if (isFolderMailbox) {
    renderMap[activeMailbox] = (item, isActive, selection) =>
      renderInboxItem(item as InboxItem, isActive, selection);
  }

  const activeItem = useMemo(() => {
    if (!selectedId) return null;

    if (activeMailbox === 'customers') {
      return customers.find(c => c.id === selectedId);
    }
    
    if (activeMailbox === 'inbox' || isFolderMailbox) {
      const firstHyphenIndex = selectedId.indexOf('-');
      const itemType =
        firstHyphenIndex > -1 ? selectedId.slice(0, firstHyphenIndex) : selectedId;
      const rawId =
        firstHyphenIndex > -1 ? selectedId.slice(firstHyphenIndex + 1) : selectedId;
      if (itemType === 'lead') {
        return leads.find(l => l.id === rawId);
      }
      if (itemType === 'message') {
        const pool = isFolderMailbox ? folderMessages : inboxMessages;
        return pool.find(m => m.id === rawId);
      }
    }

    if (activeMailbox === 'contact-requests') {
      const firstHyphenIndex = selectedId.indexOf('-');
      const itemType =
        firstHyphenIndex > -1 ? selectedId.slice(0, firstHyphenIndex) : selectedId;
      const rawId =
        firstHyphenIndex > -1 ? selectedId.slice(firstHyphenIndex + 1) : selectedId;
      if (itemType === 'lead') {
        return contactRequests.find(l => l.id === rawId);
      }
    }
    
    if (activeMailbox === 'sent') {
      return sentMessages.find(m => m.id === selectedId);
    }
    if (activeMailbox === 'spam') {
      return spamMessages.find(m => m.id === selectedId);
    }
    if (activeMailbox === 'trash') {
      return trashMessages.find((m) => m.id === selectedId);
    }

    return null;
  }, [contactRequests, customers, leads, inboxMessages, sentMessages, spamMessages, trashMessages, selectedId, activeMailbox, isFolderMailbox, folderMessages]);

  const activeLead = useMemo(() => {
    if (!activeItem) return null;
    if ("fullName" in activeItem && typeof (activeItem as Lead).fullName === "string") {
      return activeItem as Lead;
    }
    return null;
  }, [activeItem]);

  const resolvedTitle = useMemo(() => {
    if (!activeItem) return "Verlauf";
    if ("name" in activeItem && typeof activeItem.name === "string" && activeItem.name) return activeItem.name;
    if ("fullName" in activeItem && typeof (activeItem as Lead).fullName === "string" && (activeItem as Lead).fullName) {
      return (activeItem as Lead).fullName;
    }
    if ("subject" in activeItem && typeof (activeItem as CustomerMessage).subject === "string" && (activeItem as CustomerMessage).subject) {
      return (activeItem as CustomerMessage).subject as string;
    }
    return "Verlauf";
  }, [activeItem]);

  const highlightMessageId = useMemo(() => {
    if (!selectedId) return null;
    if (activeMailbox === "sent" || activeMailbox === "spam" || activeMailbox === "trash") {
      return selectedId;
    }
    if (activeMailbox === "inbox" || isFolderMailbox) {
      if (selectedId.startsWith("message-")) {
        return selectedId.replace("message-", "");
      }
    }
    if (activeMailbox === "contact-requests") {
      if (selectedId.startsWith("lead-")) {
        return selectedId;
      }
      if (selectedId.startsWith("message-")) {
        return selectedId.replace("message-", "");
      }
    }
    return null;
  }, [activeMailbox, isFolderMailbox, selectedId]);

  const contactRequestDeleteId = useMemo(() => {
    if (activeMailbox !== "contact-requests" || !selectedId) return null;
    if (selectedId.startsWith("lead-")) {
      return selectedId.replace("lead-", "");
    }
    if (selectedId.startsWith("message-")) {
      const rawId = selectedId.replace("message-", "");
      const message = threadMessages.find((entry) => entry.id === rawId);
      return message?.leadId ?? rawId;
    }
    return selectedId;
  }, [activeMailbox, selectedId, threadMessages]);

  const selectionConfig:
    | {
        enabled: boolean;
        active: boolean;
        selected: Set<string>;
        canSelect: (item: ListItem) => boolean;
        getId?: (item: ListItem) => string;
        toggle: (item: ListItem) => void;
      }
    | undefined =
    activeMailbox === "inbox" || isFolderMailbox
      ? {
          enabled: true,
          active: selectionMode,
          selected: selectedBulkIds,
          canSelect: (item: ListItem) => selectableInboxItem(item as InboxItem),
          getId: (item: ListItem) => getSelectionId(item as InboxItem),
          toggle: (item: ListItem) => toggleSelectItem(item as InboxItem),
        }
      : activeMailbox === "spam" || activeMailbox === "sent"
      ? {
          enabled: true,
          active: selectionMode,
          selected: selectedBulkIds,
          canSelect: () => true,
          getId: (item: ListItem) => ("id" in item ? (item as CustomerMessage).id : ""),
          toggle: (item: ListItem) => {
            const id = "id" in item ? (item as CustomerMessage).id : "";
            toggleSelectById(id);
          },
        }
      : activeMailbox === "contact-requests"
      ? {
          enabled: true,
          active: selectionMode,
          selected: selectedBulkIds,
          canSelect: (item: ListItem) => selectableContactRequestItem(item as InboxItem),
          getId: (item: ListItem) => getSelectionId(item as InboxItem),
          toggle: (item: ListItem) => toggleSelectItem(item as InboxItem),
        }
      : activeMailbox === "trash"
      ? {
          enabled: true,
          active: selectionMode,
          selected: selectedBulkIds,
          canSelect: () => true,
          getId: (item: ListItem) => ("id" in item ? (item as CustomerMessage).id : ""),
          toggle: (item: ListItem) => {
            const id = "id" in item ? (item as CustomerMessage).id : "";
            toggleSelectById(id);
          },
        }
      : undefined;

  const selectionActions =
    activeMailbox === "inbox" || isFolderMailbox || activeMailbox === "spam"
      ? !selectionMode
        ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectionMode(true)}
              className="gap-2 rounded-full border-[color:var(--panel-border)] bg-[color:var(--panel-bg)] text-[var(--text-primary)] hover:border-[color:var(--panel-border-strong)]"
            >
              <Square className="h-4 w-4" /> Auswählen
            </Button>
          )
        : (
            <div className="relative inline-flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm shadow-[var(--panel-shadow)]">
              <button
                type="button"
                aria-label="Auswahl beenden"
                onClick={() => clearSelection()}
                className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-slate-900/80 text-slate-200 shadow"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">
                  {selectedBulkIds.size} ausgewählt
                </span>
                <select
                  value={bulkFolderTarget}
                  onChange={(e) => setBulkFolderTarget(e.target.value)}
                  className="h-9 rounded-full border border-white/10 bg-slate-900/80 px-3 text-sm text-[var(--text-primary)] outline-none"
                >
                  <option value="">Ordner wählen</option>
                  {folders.map((folder) => (
                    <option key={folder} value={folder}>
                      {folder}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!selectedBulkIds.size || !bulkFolderTarget}
                  onClick={() => handleBulkMoveToFolder()}
                  className="gap-2 rounded-full border border-white/10 bg-white/5 text-white hover:border-white/20"
                >
                  <Folder className="h-4 w-4" /> In Ordner
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!selectedBulkIds.size || bulkProcessing}
                  onClick={() => void handleBulkMoveToTrash()}
                  className="gap-2 rounded-full border border-white/10 bg-white/5 text-white hover:border-white/20"
                >
                  <Trash2 className="h-4 w-4" /> Papierkorb
                </Button>
              </div>
            </div>
          )
      : activeMailbox === "contact-requests"
      ? !selectionMode
        ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectionMode(true)}
              className="gap-2 rounded-full border-[color:var(--panel-border)] bg-[color:var(--panel-bg)] text-[var(--text-primary)] hover:border-[color:var(--panel-border-strong)]"
            >
              <Square className="h-4 w-4" /> Auswählen
            </Button>
          )
        : (
            <div className="relative inline-flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm shadow-[var(--panel-shadow)]">
              <button
                type="button"
                aria-label="Auswahl beenden"
                onClick={() => clearSelection()}
                className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-slate-900/80 text-slate-200 shadow"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">
                  {selectedBulkIds.size} ausgewählt
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!selectedBulkIds.size || bulkProcessing}
                  onClick={() => void handleBulkMarkContactProcessed()}
                  className="gap-2 rounded-full border border-white/10 bg-white/5 text-white hover:border-white/20"
                >
                  <CheckSquare className="h-4 w-4" /> Als bearbeitet
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!selectedBulkIds.size || bulkProcessing}
                  onClick={() => void handleBulkDeleteContactRequests()}
                  className="gap-2 rounded-full border border-rose-400/20 bg-rose-500/10 text-rose-100 hover:border-rose-400/40"
                >
                  <Trash2 className="h-4 w-4" /> Endgültig löschen
                </Button>
              </div>
            </div>
          )
      : activeMailbox === "sent"
      ? !selectionMode
        ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectionMode(true)}
              className="gap-2 rounded-full border-[color:var(--panel-border)] bg-[color:var(--panel-bg)] text-[var(--text-primary)] hover:border-[color:var(--panel-border-strong)]"
            >
              <Square className="h-4 w-4" /> Auswählen
            </Button>
          )
        : (
            <div className="relative inline-flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm shadow-[var(--panel-shadow)]">
              <button
                type="button"
                aria-label="Auswahl beenden"
                onClick={() => clearSelection()}
                className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-slate-900/80 text-slate-200 shadow"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">
                  {selectedBulkIds.size} ausgewählt
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!selectedBulkIds.size || bulkProcessing}
                  onClick={() => void handleBulkMoveToTrash()}
                  className="gap-2 rounded-full border border-white/10 bg-white/5 text-white hover:border-white/20"
                >
                  <Trash2 className="h-4 w-4" /> Papierkorb
                </Button>
              </div>
            </div>
          )
      : activeMailbox === "trash"
      ? !selectionMode
        ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectionMode(true)}
              className="gap-2 rounded-full border-[color:var(--panel-border)] bg-[color:var(--panel-bg)] text-[var(--text-primary)] hover:border-[color:var(--panel-border-strong)]"
            >
              <Square className="h-4 w-4" /> Auswählen
            </Button>
          )
        : (
            <div className="relative inline-flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm shadow-[var(--panel-shadow)]">
              <button
                type="button"
                aria-label="Auswahl beenden"
                onClick={() => clearSelection()}
                className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-slate-900/80 text-slate-200 shadow"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">
                  {selectedBulkIds.size} ausgewählt
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!selectedBulkIds.size || bulkProcessing}
                  onClick={() => void handleBulkRestoreFromTrash()}
                  className="gap-2 rounded-full border border-white/10 bg-white/5 text-white hover:border-white/20"
                >
                  <RotateCcw className="h-4 w-4" /> Wiederherstellen
                </Button>
              </div>
            </div>
          )
      : null;

  return (
    <section className="flex h-full flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold text-white">Nachrichten</h1>
            {displayUnreadSummary.total > 0 && (
              <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-100">
                {displayUnreadSummary.total} neu
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400">Ihr zentrales Postfach für die Kundenkommunikation.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void fetchMailboxData(customerIdFromUrl)} disabled={loading}>
            <RefreshCw className={clsx("mr-2 h-4 w-4", loading && "animate-spin")} /> Aktualisieren
          </Button>
          <Button onClick={() => { setMessageToReplyTo(null); setIsComposerOpen(true); if (typeof window !== "undefined") window.localStorage.setItem(COMPOSER_OPEN_KEY, "1"); }}>
              <Mail className="mr-2 h-4 w-4" /> Neue Nachricht
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <div className="grid h-[calc(100vh-220px)] min-h-0 grid-cols-[70px_minmax(0,1fr)] gap-3 overflow-hidden lg:grid-cols-[minmax(200px,26%)_minmax(0,74%)] lg:gap-6">
          <MailboxSidebar 
            activeMailbox={activeMailbox}
            onMailboxChange={handleMailboxChange}
            unreadCounts={{
              leads: Object.values(displayUnreadSummary.leads).reduce((a, b) => a + b, 0),
              unassigned: displayUnreadSummary.unassigned,
              contactRequests: displayUnreadSummary.contactRequests ?? 0,
              trash: trashMessages.length,
            }}
            folders={folders}
            folderUnread={folderUnread}
            onCreateFolder={handleCreateFolder}
            onRenameFolder={handleRenameFolder}
            onDeleteFolder={handleDeleteFolder}
            onMoveFolder={handleMoveFolder}
            onOpenSettings={() => router.push("/settings")}
            className="sticky top-4 h-full min-h-0 w-[70px] max-w-[70px] lg:w-auto lg:max-w-none"
          />

          <div className="flex h-full min-h-0 flex-col overflow-hidden">
              {!selectedId ? (
                  <MessageList
                      items={filteredItems}
                      selectedId={selectedId}
                      onSelect={handleItemSelect}
                      actions={selectionActions}
                      selection={selectionConfig}
                      loading={loading}
                      error={error}
                      searchQuery={search}
                      onSearchChange={setSearch}
                      renderItem={renderMap[activeMailbox]}
                      listTitle={
                        activeMailbox === 'inbox'
                          ? 'Posteingang'
                          : activeMailbox === 'contact-requests'
                          ? (
                            <div>
                              <div className="flex items-center gap-2">
                                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Kontaktanfragen</h2>
                                <div className="relative">
                                  <button
                                    type="button"
                                    aria-label="DSGVO-Info zu Kontaktanfragen"
                                    aria-expanded={isContactInfoOpen}
                                    aria-controls="contact-requests-dsgvo-info"
                                    onClick={() => setIsContactInfoOpen((prev) => !prev)}
                                    className="flex h-7 w-7 items-center justify-center rounded-full border border-sky-400/40 bg-sky-500/15 text-sky-100 transition hover:bg-sky-500/25"
                                  >
                                    <Info className="h-4 w-4" />
                                  </button>
                                  {isContactInfoOpen && (
                                    <div
                                      id="contact-requests-dsgvo-info"
                                      role="region"
                                      aria-label="DSGVO-Info zu Kontaktanfragen"
                                      className="absolute left-1/2 top-full z-10 mt-1 w-80 max-w-[85vw] -translate-x-1/2 rounded-2xl border border-sky-400/30 bg-slate-900 p-3 text-xs text-slate-100 shadow-[0_20px_60px_-35px_rgba(56,189,248,0.45)]"
                                    >
                                      <p className="font-semibold text-sky-100">Hinweis zur Datenverarbeitung</p>
                                      <p className="mt-2 text-slate-100/90">
                                        Kontaktanfragen enthalten personenbezogene Daten. Bitte überführe relevante Informationen
                                        vor dem Markieren als „bearbeitet“ in ein Kundenprofil. Nach der Bearbeitung können
                                        Kontaktanfragen gemäß DSGVO zeitnah gelöscht werden, damit keine unnötigen Daten im System bleiben.
                                        Kontaktanfragen werden zudem automatisch 30 Tage nach Eingang entfernt.
                                      </p>
                                      <p className="mt-2 text-slate-200/80">
                                        Wenn eine Anfrage endgültig gelöscht wird, ist sie nicht wiederherstellbar.
                                        Bei Auskunfts- oder Löschersuchen bitte die Anfrage so schnell wie möglich entfernen.
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                          : activeMailbox === 'customers'
                          ? 'Kunden'
                          : activeMailbox === 'sent'
                          ? 'Gesendet'
                          : activeMailbox === 'spam'
                          ? 'Spam'
                          : activeMailbox === 'trash'
                          ? 'Papierkorb'
                          : isFolderMailbox && activeFolder
                          ? `Ordner: ${activeFolder}`
                          : 'Nachrichten'
                      }
                      listDescription="Wählen Sie einen Eintrag, um den Verlauf zu sehen."
                      layout={activeMailbox === "customers" ? "grid" : "list"}
                      gridClassName="grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5"
                  />
              ) : (
                  <MessageView
                      messages={threadMessages}
                      loading={loadingThread}
                      error={threadError}
                      highlightMessageId={highlightMessageId}
                      onBack={() => {
                        if (customerIdFromUrl) {
                          router.push("/workspace/messages");
                        }
                        setSelectedId(null);
                        setMessageToReplyTo(null);
                      }}
                      onReply={(message) => { setMessageToReplyTo(message); setIsComposerOpen(true); if (typeof window !== "undefined") window.localStorage.setItem(COMPOSER_OPEN_KEY, "1"); }}
                      onMoveToFolder={
                        activeMailbox === "contact-requests"
                          ? undefined
                          : (message, folder) => handleMoveToFolder(message, folder)
                      }
                      onMoveToTrash={
                        activeMailbox === "contact-requests"
                          ? undefined
                          : (message) => handleSingleMoveToTrash(message)
                      }
                      onDeletePermanently={
                        activeMailbox === "contact-requests"
                          ? (message) => {
                              const leadId = contactRequestDeleteId ?? message.leadId ?? message.id;
                              if (!leadId) return;
                              void handleDeleteContactRequest(leadId);
                            }
                          : undefined
                      }
                      onExtractContact={(message) =>
                        activeMailbox === "contact-requests"
                          ? void handleExtractContactRequest(message, activeLead)
                          : void handleExtractContact(message)
                      }
                      extractingMessageId={extractingContactFor}
                      folders={folders}
                      title={resolvedTitle}
                      description={"Details zur Konversation"}
                  />
      )}
          </div>
        </div>
      </div>
      
      <ComposerModal 
        isOpen={isComposerOpen}
        onClose={() => { setIsComposerOpen(false); if (typeof window !== "undefined") window.localStorage.removeItem(COMPOSER_OPEN_KEY); }}
        onMessageSent={handleMessageSent}
        customer={activeMailbox === 'customers' ? activeItem as Customer : undefined}
        lead={(activeMailbox === 'inbox' || activeMailbox === 'contact-requests' || isFolderMailbox) && (activeItem as Lead)?.fullName ? activeItem as Lead : undefined}
        thread={threadMessages}
        messageToReplyTo={
          messageToReplyTo ??
          ((activeMailbox === 'inbox' || activeMailbox === 'contact-requests' || isFolderMailbox) && !(activeItem as Lead)?.fullName ? (activeItem as CustomerMessage) : null)
        }
        smtpReady={smtpReady}
        smtpStatus={smtpStatus}
        contactSuggestions={contactSuggestions}
      />
      <CustomerModal
        mode="create"
        open={showCustomerModal}
        prefill={customerPrefill}
        onClose={() => { setShowCustomerModal(false); setCustomerPrefill(null); }}
        onSaved={(customer) => {
          setShowCustomerModal(false);
          setCustomerPrefill(null);
          setCustomers((prev) => {
            const map = new Map(prev.map((c) => [c.id, c]));
            map.set(customer.id, customer);
            return Array.from(map.values());
          });
        }}
      />
    </section>
  );
}
