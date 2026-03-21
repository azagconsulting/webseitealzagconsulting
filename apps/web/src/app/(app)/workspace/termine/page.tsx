"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Pencil,
  Plus,
  Repeat2,
  Trash2,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/components/auth-provider";
import type { AuthUser, CustomerType } from "@/lib/types";

type SlotStatus = "free" | "blocked";
type RecurrenceRule = "daily" | "weekly";

interface AppointmentSlot {
  id: string;
  date: string;
  start: string;
  end: string;
  title: string;
  status: SlotStatus;
  createdById?: string | null;
  bookedById?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  attendeeName?: string | null;
  attendeeEmail?: string | null;
  attendeePhone?: string | null;
  meetingLink?: string | null;
  bookingNotes?: string | null;
  bookedAt?: string | null;
  reminderSentAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

interface StandardSlotTemplate {
  id: string;
  title: string;
  start: string;
  end: string;
  status: SlotStatus;
  recurrence: RecurrenceRule;
  weekdays: number[];
  createdAt: string;
  updatedAt?: string;
}

interface CalendarCell {
  date: string;
  day: number;
  inCurrentMonth: boolean;
  isToday: boolean;
}

interface CalendarSlot extends AppointmentSlot {
  source: "manual" | "standard";
  templateId?: string;
  recurrence?: RecurrenceRule;
}

const WEEK_DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

interface TermineSlotsResponse {
  items?: AppointmentSlot[];
}

interface TermineTemplatesResponse {
  items?: StandardSlotTemplate[];
}

interface CustomerOption {
  id: string;
  name: string;
}

interface CustomersListResponse {
  items?: CustomerOption[];
}

type EmployeeOption = Pick<
  AuthUser,
  "id" | "firstName" | "lastName" | "email" | "role"
>;

interface ReminderResponse {
  success: boolean;
  recipient?: string;
  slot?: AppointmentSlot;
}

interface TermineCustomerSuggestionResponse {
  customer: {
    name: string | null;
    type: CustomerType;
    email: string | null;
    phone: string | null;
    mobile: string | null;
    street: string | null;
    postalCode: string | null;
    city: string | null;
    preferredChannel: string | null;
    marketingOptIn: boolean;
    notes: string | null;
    tags: string[];
    lastContactAt: string | null;
  };
  contact: {
    name: string | null;
    role: string | null;
    email: string | null;
    phone: string | null;
    channel: string | null;
  };
}

const monthFormatter = new Intl.DateTimeFormat("de-DE", {
  month: "long",
  year: "numeric",
});

const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const toIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const fromIsoDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};

const startOfMonth = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), 1);

const endOfMonth = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth() + 1, 0);

const addDays = (date: Date, offset: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);

const formatTimeRange = (start: string, end: string) => `${start} - ${end}`;

const hasNullableString = (value: unknown) =>
  value === undefined || value === null || typeof value === "string";

const isSlotBookable = (slot: Pick<AppointmentSlot, "status" | "customerId">) =>
  slot.status === "free" && !slot.customerId;

const overlapsTimeRanges = (
  startA: string,
  endA: string,
  startB: string,
  endB: string,
) => !(endA <= startB || startA >= endB);

const weekdayIndexFromIso = (value: string) => {
  const date = fromIsoDate(value);
  return (date.getDay() + 6) % 7;
};

const eachIsoDateInRange = (fromIso: string, toIso: string) => {
  const result: string[] = [];
  let current = fromIsoDate(fromIso);
  const end = fromIsoDate(toIso);
  while (current <= end) {
    result.push(toIsoDate(current));
    current = addDays(current, 1);
  }
  return result;
};

const formatWeekdaySelection = (weekdays: number[]) => {
  const unique = Array.from(new Set(weekdays)).sort((a, b) => a - b);
  if (unique.length === 7) return "Täglich";
  if (unique.length === 5 && unique.every((value, index) => value === index)) {
    return "Mo-Fr";
  }
  return unique.map((weekday) => WEEK_DAYS[weekday] ?? "").join(", ");
};

const isValidSlot = (value: unknown): value is AppointmentSlot => {
  if (!value || typeof value !== "object") return false;
  const slot = value as Partial<AppointmentSlot>;
  return (
    typeof slot.id === "string" &&
    typeof slot.date === "string" &&
    typeof slot.start === "string" &&
    typeof slot.end === "string" &&
    typeof slot.title === "string" &&
    (slot.status === "free" || slot.status === "blocked") &&
    hasNullableString(slot.createdById) &&
    hasNullableString(slot.bookedById) &&
    hasNullableString(slot.customerId) &&
    hasNullableString(slot.customerName) &&
    hasNullableString(slot.attendeeName) &&
    hasNullableString(slot.attendeeEmail) &&
    hasNullableString(slot.attendeePhone) &&
    hasNullableString(slot.meetingLink) &&
    hasNullableString(slot.bookingNotes) &&
    hasNullableString(slot.bookedAt) &&
    hasNullableString(slot.reminderSentAt)
  );
};

const isValidCustomerOption = (value: unknown): value is CustomerOption => {
  if (!value || typeof value !== "object") return false;
  const customer = value as Partial<CustomerOption>;
  return typeof customer.id === "string" && typeof customer.name === "string";
};

const isValidEmployeeOption = (value: unknown): value is EmployeeOption => {
  if (!value || typeof value !== "object") return false;
  const employee = value as Partial<EmployeeOption>;
  return (
    typeof employee.id === "string" &&
    typeof employee.email === "string" &&
    (employee.role === "ADMIN" ||
      employee.role === "COORDINATOR" ||
      employee.role === "AGENT" ||
      employee.role === "VIEWER")
  );
};

const formatEmployeeLabel = (employee: EmployeeOption) => {
  const name = [employee.firstName, employee.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (name) {
    return `${name} (${employee.role})`;
  }
  return `${employee.email} (${employee.role})`;
};

const isValidStandardTemplate = (
  value: unknown,
): value is StandardSlotTemplate => {
  if (!value || typeof value !== "object") return false;
  const template = value as Partial<StandardSlotTemplate>;
  const weekdays = Array.isArray(template.weekdays)
    ? template.weekdays
    : [];
  return (
    typeof template.id === "string" &&
    typeof template.title === "string" &&
    typeof template.start === "string" &&
    typeof template.end === "string" &&
    (template.status === "free" || template.status === "blocked") &&
    (template.recurrence === "daily" || template.recurrence === "weekly") &&
    weekdays.every((value) => Number.isInteger(value) && value >= 0 && value <= 6)
  );
};

const matchesTemplateOnDate = (
  template: StandardSlotTemplate,
  isoDate: string,
) => {
  if (template.recurrence === "daily") return true;
  const weekday = weekdayIndexFromIso(isoDate);
  return template.weekdays.includes(weekday);
};

export default function TerminePage() {
  const { user, authorizedRequest, loading: authLoading } = useAuth();
  const todayIso = useMemo(() => toIsoDate(new Date()), []);
  const [currentMonth, setCurrentMonth] = useState(() =>
    startOfMonth(new Date()),
  );
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [slots, setSlots] = useState<AppointmentSlot[]>([]);
  const [standardTemplates, setStandardTemplates] = useState<
    StandardSlotTemplate[]
  >([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [slotPending, setSlotPending] = useState(false);
  const [templatePending, setTemplatePending] = useState(false);

  const [slotTitle, setSlotTitle] = useState("Erstgespraech");
  const [slotStart, setSlotStart] = useState("09:00");
  const [slotEnd, setSlotEnd] = useState("09:30");
  const [slotStatus, setSlotStatus] = useState<SlotStatus>("free");
  const [slotError, setSlotError] = useState<string | null>(null);
  const [slotMessage, setSlotMessage] = useState<string | null>(null);

  const [templateTitle, setTemplateTitle] = useState("Standard Beratung");
  const [templateStart, setTemplateStart] = useState("10:00");
  const [templateEnd, setTemplateEnd] = useState("10:30");
  const [templateStatus, setTemplateStatus] = useState<SlotStatus>("free");
  const [templateRecurrence, setTemplateRecurrence] =
    useState<RecurrenceRule>("weekly");
  const [templateWeekdays, setTemplateWeekdays] = useState<number[]>([
    0, 1, 2, 3, 4,
  ]);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [templateMessage, setTemplateMessage] = useState<string | null>(null);
  const [slotModalOpen, setSlotModalOpen] = useState(false);
  const [standardModalOpen, setStandardModalOpen] = useState(false);
  const [editTemplateModalOpen, setEditTemplateModalOpen] = useState(false);
  const [editTemplateTargetId, setEditTemplateTargetId] = useState<string | null>(
    null,
  );
  const [editTemplateTitle, setEditTemplateTitle] = useState("");
  const [editTemplateStart, setEditTemplateStart] = useState("10:00");
  const [editTemplateEnd, setEditTemplateEnd] = useState("10:30");
  const [editTemplateStatus, setEditTemplateStatus] = useState<SlotStatus>("free");
  const [editTemplateRecurrence, setEditTemplateRecurrence] =
    useState<RecurrenceRule>("weekly");
  const [editTemplateWeekdays, setEditTemplateWeekdays] = useState<number[]>([
    0, 1, 2, 3, 4,
  ]);
  const [editTemplatePending, setEditTemplatePending] = useState(false);
  const [editTemplateError, setEditTemplateError] = useState<string | null>(null);
  const [editTemplateMessage, setEditTemplateMessage] = useState<string | null>(
    null,
  );
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOption[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [bookingTargetSlot, setBookingTargetSlot] = useState<CalendarSlot | null>(
    null,
  );
  const [daySlotDetailsModalOpen, setDaySlotDetailsModalOpen] = useState(false);
  const [daySlotDetailsSlotId, setDaySlotDetailsSlotId] = useState<
    string | null
  >(null);
  const [editSlotModalOpen, setEditSlotModalOpen] = useState(false);
  const [editSlotTargetId, setEditSlotTargetId] = useState<string | null>(null);
  const [editSlotDate, setEditSlotDate] = useState(todayIso);
  const [editSlotTitle, setEditSlotTitle] = useState("");
  const [editSlotStart, setEditSlotStart] = useState("09:00");
  const [editSlotEnd, setEditSlotEnd] = useState("09:30");
  const [editSlotLink, setEditSlotLink] = useState("");
  const [editSlotStatus, setEditSlotStatus] = useState<SlotStatus>("free");
  const [editSlotBookedById, setEditSlotBookedById] = useState("");
  const [editSlotHasBooking, setEditSlotHasBooking] = useState(false);
  const [editSlotPending, setEditSlotPending] = useState(false);
  const [editSlotError, setEditSlotError] = useState<string | null>(null);
  const [editSlotMessage, setEditSlotMessage] = useState<string | null>(null);
  const [bookingCustomerId, setBookingCustomerId] = useState("");
  const [bookingName, setBookingName] = useState("");
  const [bookingEmail, setBookingEmail] = useState("");
  const [bookingPhone, setBookingPhone] = useState("");
  const [bookingLink, setBookingLink] = useState("");
  const [bookingNotes, setBookingNotes] = useState("");
  const [bookingPending, setBookingPending] = useState(false);
  const [reminderPendingSlotId, setReminderPendingSlotId] = useState<string | null>(
    null,
  );
  const [createCustomerPendingSlotId, setCreateCustomerPendingSlotId] =
    useState<string | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingMessage, setBookingMessage] = useState<string | null>(null);

  const fetchCalendarData = useCallback(async () => {
    if (authLoading || !user) return;
    setDataLoading(true);
    try {
      const [slotsResponse, templatesResponse] = await Promise.all([
        authorizedRequest<TermineSlotsResponse>("/termine/slots"),
        authorizedRequest<TermineTemplatesResponse>("/termine/templates"),
      ]);

      const safeSlots = Array.isArray(slotsResponse?.items)
        ? slotsResponse.items.filter(isValidSlot)
        : [];
      const safeTemplates = Array.isArray(templatesResponse?.items)
        ? templatesResponse.items.filter(isValidStandardTemplate)
        : [];

      setSlots(safeSlots);
      setStandardTemplates(safeTemplates);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Termindaten konnten nicht geladen werden.";
      setSlotError(message);
      setTemplateError(message);
    } finally {
      setDataLoading(false);
    }
  }, [authLoading, authorizedRequest, user]);

  useEffect(() => {
    void fetchCalendarData();
  }, [fetchCalendarData]);

  const fetchCustomers = useCallback(async () => {
    if (authLoading || !user) return;
    setCustomersLoading(true);
    try {
      const response = await authorizedRequest<CustomersListResponse>(
        "/customers?limit=100",
      );
      const safeCustomers = Array.isArray(response?.items)
        ? response.items.filter(isValidCustomerOption)
        : [];
      setCustomerOptions(
        safeCustomers.sort((a, b) => a.name.localeCompare(b.name, "de")),
      );
    } catch (error) {
      setBookingError(
        error instanceof Error
          ? error.message
          : "Kunden konnten nicht geladen werden.",
      );
    } finally {
      setCustomersLoading(false);
    }
  }, [authLoading, authorizedRequest, user]);

  useEffect(() => {
    void fetchCustomers();
  }, [fetchCustomers]);

  const fetchEmployees = useCallback(async () => {
    if (authLoading || !user) return;
    setEmployeesLoading(true);
    try {
      const response = await authorizedRequest<AuthUser[]>("/users");
      const safeEmployees = Array.isArray(response)
        ? response.filter(isValidEmployeeOption)
        : [];
      setEmployeeOptions(
        safeEmployees.sort((a, b) =>
          formatEmployeeLabel(a).localeCompare(formatEmployeeLabel(b), "de"),
        ),
      );
    } catch (error) {
      setEditSlotError(
        error instanceof Error
          ? error.message
          : "Mitarbeiter konnten nicht geladen werden.",
      );
    } finally {
      setEmployeesLoading(false);
    }
  }, [authLoading, authorizedRequest, user]);

  useEffect(() => {
    void fetchEmployees();
  }, [fetchEmployees]);

  const defaultAdminId = useMemo(
    () => employeeOptions.find((employee) => employee.role === "ADMIN")?.id ?? "",
    [employeeOptions],
  );

  const isCalendarBusy = authLoading || dataLoading;

  const manualSlotsByDate = useMemo(() => {
    const map = new Map<string, CalendarSlot[]>();
    slots.forEach((slot) => {
      const current = map.get(slot.date) ?? [];
      current.push({ ...slot, source: "manual" });
      map.set(slot.date, current);
    });
    map.forEach((value, key) => {
      map.set(
        key,
        value.sort((a, b) =>
          a.start === b.start
            ? a.end.localeCompare(b.end)
            : a.start.localeCompare(b.start),
        ),
      );
    });
    return map;
  }, [slots]);

  const standardSlotsForDate = useCallback(
    (isoDate: string): CalendarSlot[] =>
      standardTemplates
        .filter((template) => matchesTemplateOnDate(template, isoDate))
        .map((template) => ({
          id: `standard-${template.id}-${isoDate}-${template.start}-${template.end}`,
          date: isoDate,
          start: template.start,
          end: template.end,
          title: template.title,
          status: template.status,
          createdAt: template.createdAt,
          source: "standard" as const,
          templateId: template.id,
          recurrence: template.recurrence,
        }))
        .sort((a, b) =>
          a.start === b.start
            ? a.end.localeCompare(b.end)
            : a.start.localeCompare(b.start),
        ),
    [standardTemplates],
  );

  const resolveDaySlots = useCallback(
    (isoDate: string) => {
      const manualSlots = manualSlotsByDate.get(isoDate) ?? [];
      const generatedStandard = standardSlotsForDate(isoDate);

      const nonOverlappingStandard: CalendarSlot[] = [];
      generatedStandard.forEach((candidate) => {
        const overlapsManual = manualSlots.some((manual) =>
          overlapsTimeRanges(
            manual.start,
            manual.end,
            candidate.start,
            candidate.end,
          ),
        );
        const overlapsStandard = nonOverlappingStandard.some((existing) =>
          overlapsTimeRanges(
            existing.start,
            existing.end,
            candidate.start,
            candidate.end,
          ),
        );

        if (!overlapsManual && !overlapsStandard) {
          nonOverlappingStandard.push(candidate);
        }
      });

      return [...manualSlots, ...nonOverlappingStandard].sort((a, b) =>
        a.start === b.start
          ? a.end.localeCompare(b.end)
          : a.start.localeCompare(b.start),
      );
    },
    [manualSlotsByDate, standardSlotsForDate],
  );

  const calendarCells = useMemo<CalendarCell[]>(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const startOffset = (firstOfMonth.getDay() + 6) % 7;
    const cells: CalendarCell[] = [];

    for (let index = 0; index < 42; index += 1) {
      const date = new Date(year, month, 1 + index - startOffset);
      const isoDate = toIsoDate(date);
      cells.push({
        date: isoDate,
        day: date.getDate(),
        inCurrentMonth: date.getMonth() === month,
        isToday: isoDate === todayIso,
      });
    }
    return cells;
  }, [currentMonth, todayIso]);

  const slotStatsByDate = useMemo(() => {
    const map = new Map<string, { free: number; blocked: number }>();
    calendarCells.forEach((cell) => {
      const summary = resolveDaySlots(cell.date).reduce(
        (acc, slot) => {
          if (isSlotBookable(slot)) {
            acc.free += 1;
          } else {
            acc.blocked += 1;
          }
          return acc;
        },
        { free: 0, blocked: 0 },
      );
      map.set(cell.date, summary);
    });
    return map;
  }, [calendarCells, resolveDaySlots]);

  const selectedDateObject = useMemo(
    () => fromIsoDate(selectedDate),
    [selectedDate],
  );

  const daySlots = useMemo(
    () => resolveDaySlots(selectedDate),
    [resolveDaySlots, selectedDate],
  );
  const daySlotDetailsSlot = useMemo(() => {
    if (!daySlotDetailsSlotId) return null;
    return daySlots.find((slot) => slot.id === daySlotDetailsSlotId) ?? null;
  }, [daySlotDetailsSlotId, daySlots]);

  useEffect(() => {
    if (!daySlotDetailsModalOpen || !daySlotDetailsSlotId) return;
    if (!daySlotDetailsSlot) {
      setDaySlotDetailsModalOpen(false);
      setDaySlotDetailsSlotId(null);
    }
  }, [daySlotDetailsModalOpen, daySlotDetailsSlot, daySlotDetailsSlotId]);

  useEffect(() => {
    if (!editSlotHasBooking) return;
    if (editSlotBookedById) return;
    if (!defaultAdminId) return;
    setEditSlotBookedById(defaultAdminId);
  }, [defaultAdminId, editSlotBookedById, editSlotHasBooking]);

  const selectedWeekRange = useMemo(() => {
    const date = fromIsoDate(selectedDate);
    const weekdayIndex = (date.getDay() + 6) % 7;
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - weekdayIndex);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    return {
      from: toIsoDate(weekStart),
      to: toIsoDate(weekEnd),
    };
  }, [selectedDate]);

  const freeSlotsInWeek = useMemo(
    () =>
      eachIsoDateInRange(selectedWeekRange.from, selectedWeekRange.to).reduce(
        (sum, date) =>
          sum +
          resolveDaySlots(date).filter((slot) => isSlotBookable(slot)).length,
        0,
      ),
    [resolveDaySlots, selectedWeekRange.from, selectedWeekRange.to],
  );

  const freeSlotsInMonth = useMemo(() => {
    const monthStart = toIsoDate(startOfMonth(currentMonth));
    const monthEnd = toIsoDate(endOfMonth(currentMonth));
    return eachIsoDateInRange(monthStart, monthEnd).reduce(
      (sum, date) =>
        sum +
        resolveDaySlots(date).filter((slot) => isSlotBookable(slot)).length,
      0,
    );
  }, [currentMonth, resolveDaySlots]);

  const employeeLabelsById = useMemo(() => {
    const map = new Map<string, string>();
    employeeOptions.forEach((employee) => {
      map.set(employee.id, formatEmployeeLabel(employee));
    });
    return map;
  }, [employeeOptions]);

  const nextAssignedSlot = useMemo(() => {
    if (!user?.id) return null;

    const now = Date.now();
    const assigned = slots
      .filter((slot) => slot.bookedById === user.id)
      .map((slot) => ({
        slot,
        startsAt: new Date(`${slot.date}T${slot.start}:00`).getTime(),
      }))
      .filter((entry) => Number.isFinite(entry.startsAt) && entry.startsAt >= now)
      .sort((a, b) => a.startsAt - b.startsAt);

    return assigned[0]?.slot ?? null;
  }, [slots, user?.id]);

  const handleMonthShift = (offset: number) => {
    setCurrentMonth(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1),
    );
  };

  const handleSelectDate = (date: string) => {
    setSelectedDate(date);
    setDaySlotDetailsModalOpen(false);
    setDaySlotDetailsSlotId(null);
    const next = fromIsoDate(date);
    setCurrentMonth(new Date(next.getFullYear(), next.getMonth(), 1));
    setSlotError(null);
    setSlotMessage(null);
  };

  const resetManualForm = () => {
    setSlotTitle("Erstgespraech");
    setSlotStart("09:00");
    setSlotEnd("09:30");
    setSlotStatus("free");
  };

  const resetTemplateForm = () => {
    setTemplateTitle("Standard Beratung");
    setTemplateStart("10:00");
    setTemplateEnd("10:30");
    setTemplateStatus("free");
    setTemplateRecurrence("weekly");
    setTemplateWeekdays([0, 1, 2, 3, 4]);
  };

  const toggleTemplateWeekday = (weekday: number) => {
    setTemplateWeekdays((prev) => {
      if (prev.includes(weekday)) {
        return prev.filter((value) => value !== weekday).sort((a, b) => a - b);
      }
      return [...prev, weekday].sort((a, b) => a - b);
    });
  };

  const toggleEditTemplateWeekday = (weekday: number) => {
    setEditTemplateWeekdays((prev) => {
      if (prev.includes(weekday)) {
        return prev.filter((value) => value !== weekday).sort((a, b) => a - b);
      }
      return [...prev, weekday].sort((a, b) => a - b);
    });
  };

  const handleAddSlot = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSlotError(null);
    setSlotMessage(null);

    const normalizedTitle = slotTitle.trim();
    if (!normalizedTitle) {
      setSlotError("Bitte geben Sie einen Titel fuer den Slot ein.");
      return;
    }
    if (slotEnd <= slotStart) {
      setSlotError("Endzeit muss nach der Startzeit liegen.");
      return;
    }

    const overlaps = resolveDaySlots(selectedDate).some((slot) =>
      overlapsTimeRanges(slotStart, slotEnd, slot.start, slot.end),
    );
    if (overlaps) {
      setSlotError(
        "Dieser Zeitraum ueberschneidet sich mit einem bestehenden Slot.",
      );
      return;
    }

    setSlotPending(true);
    try {
      const created = await authorizedRequest<AppointmentSlot>("/termine/slots", {
        method: "POST",
        body: JSON.stringify({
          date: selectedDate,
          start: slotStart,
          end: slotEnd,
          title: normalizedTitle,
          status: slotStatus,
        }),
      });

      if (!isValidSlot(created)) {
        throw new Error("Serverantwort fuer Slot ist ungueltig.");
      }

      setSlots((prev) => [...prev, created]);
      setSlotMessage(
        slotStatus === "free"
          ? "Freier Slot wurde hinzugefuegt."
          : "Zeitblock wurde hinzugefuegt.",
      );
      resetManualForm();
      setSlotModalOpen(false);
    } catch (error) {
      setSlotError(
        error instanceof Error
          ? error.message
          : "Slot konnte nicht gespeichert werden.",
      );
    } finally {
      setSlotPending(false);
    }
  };

  const handleAddStandardTemplate = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setTemplateError(null);
    setTemplateMessage(null);

    const normalizedTitle = templateTitle.trim();
    const normalizedWeekdays = Array.from(new Set(templateWeekdays)).sort(
      (a, b) => a - b,
    );

    if (!normalizedTitle) {
      setTemplateError("Bitte geben Sie einen Titel fuer den Standard-Slot ein.");
      return;
    }
    if (templateEnd <= templateStart) {
      setTemplateError("Endzeit muss nach der Startzeit liegen.");
      return;
    }
    if (templateRecurrence === "weekly" && normalizedWeekdays.length === 0) {
      setTemplateError(
        "Bitte waehlen Sie mindestens einen Wochentag fuer die Wiederholung.",
      );
      return;
    }

    setTemplatePending(true);
    try {
      const created = await authorizedRequest<StandardSlotTemplate>(
        "/termine/templates",
        {
          method: "POST",
          body: JSON.stringify({
            title: normalizedTitle,
            start: templateStart,
            end: templateEnd,
            status: templateStatus,
            recurrence: templateRecurrence,
            weekdays: templateRecurrence === "daily" ? undefined : normalizedWeekdays,
          }),
        },
      );

      if (!isValidStandardTemplate(created)) {
        throw new Error("Serverantwort fuer Standard-Slot ist ungueltig.");
      }

      setStandardTemplates((prev) => [...prev, created]);
      setTemplateMessage(
        templateRecurrence === "daily"
          ? "Standard-Slot wurde fuer taegliche Wiederholung gespeichert."
          : "Standard-Slot wurde fuer woechentliche Wiederholung gespeichert.",
      );
      resetTemplateForm();
      setStandardModalOpen(false);
    } catch (error) {
      setTemplateError(
        error instanceof Error
          ? error.message
          : "Standard-Slot konnte nicht gespeichert werden.",
      );
    } finally {
      setTemplatePending(false);
    }
  };

  const handleDeleteSlot = async (slotId: string) => {
    setSlotPending(true);
    setSlotError(null);
    try {
      await authorizedRequest<{ success: boolean }>(`/termine/slots/${slotId}`, {
        method: "DELETE",
      });
      setSlots((prev) => prev.filter((slot) => slot.id !== slotId));
      setSlotMessage("Slot wurde entfernt.");
      return true;
    } catch (error) {
      setSlotError(
        error instanceof Error ? error.message : "Slot konnte nicht geloescht werden.",
      );
      return false;
    } finally {
      setSlotPending(false);
    }
  };

  const handleToggleSlotStatus = async (slotId: string) => {
    const current = slots.find((slot) => slot.id === slotId);
    if (!current) return;

    const nextStatus: SlotStatus =
      current.status === "free" ? "blocked" : "free";

    setSlotPending(true);
    setSlotError(null);
    try {
      const updated = await authorizedRequest<AppointmentSlot>(
        `/termine/slots/${slotId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: nextStatus }),
        },
      );
      if (!isValidSlot(updated)) {
        throw new Error("Serverantwort fuer Slot ist ungueltig.");
      }

      setSlots((prev) =>
        prev.map((slot) => (slot.id === slotId ? updated : slot)),
      );
      setSlotMessage("Slot-Status wurde aktualisiert.");
    } catch (error) {
      setSlotError(
        error instanceof Error
          ? error.message
          : "Slot-Status konnte nicht aktualisiert werden.",
      );
    } finally {
      setSlotPending(false);
    }
  };

  const handleDeleteStandardTemplate = async (templateId: string) => {
    setTemplatePending(true);
    setTemplateError(null);
    try {
      await authorizedRequest<{ success: boolean }>(
        `/termine/templates/${templateId}`,
        {
          method: "DELETE",
        },
      );
      setStandardTemplates((prev) =>
        prev.filter((template) => template.id !== templateId),
      );
      setTemplateMessage("Standard-Slot wurde entfernt.");
    } catch (error) {
      setTemplateError(
        error instanceof Error
          ? error.message
          : "Standard-Slot konnte nicht geloescht werden.",
      );
    } finally {
      setTemplatePending(false);
    }
  };

  const handleToggleStandardTemplateStatus = async (templateId: string) => {
    const current = standardTemplates.find((template) => template.id === templateId);
    if (!current) return;

    const nextStatus: SlotStatus =
      current.status === "free" ? "blocked" : "free";

    setTemplatePending(true);
    setTemplateError(null);
    try {
      const updated = await authorizedRequest<StandardSlotTemplate>(
        `/termine/templates/${templateId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: nextStatus }),
        },
      );
      if (!isValidStandardTemplate(updated)) {
        throw new Error("Serverantwort fuer Standard-Slot ist ungueltig.");
      }

      setStandardTemplates((prev) =>
        prev.map((template) => (template.id === templateId ? updated : template)),
      );
      setTemplateMessage("Standard-Slot-Status wurde aktualisiert.");
    } catch (error) {
      setTemplateError(
        error instanceof Error
          ? error.message
          : "Standard-Slot-Status konnte nicht aktualisiert werden.",
      );
    } finally {
      setTemplatePending(false);
    }
  };

  const handleOpenEditStandardTemplate = (template: StandardSlotTemplate) => {
    setEditTemplateTargetId(template.id);
    setEditTemplateTitle(template.title);
    setEditTemplateStart(template.start);
    setEditTemplateEnd(template.end);
    setEditTemplateStatus(template.status);
    setEditTemplateRecurrence(template.recurrence);
    setEditTemplateWeekdays(
      template.recurrence === "daily"
        ? [0, 1, 2, 3, 4, 5, 6]
        : [...template.weekdays].sort((a, b) => a - b),
    );
    setEditTemplateError(null);
    setEditTemplateMessage(null);
    setEditTemplateModalOpen(true);
  };

  const handleEditStandardTemplate = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setEditTemplateError(null);
    setEditTemplateMessage(null);
    setTemplateError(null);
    setTemplateMessage(null);

    if (!editTemplateTargetId) {
      setEditTemplateError("Bitte waehlen Sie einen Standard-Slot zum Bearbeiten.");
      return;
    }

    const normalizedTitle = editTemplateTitle.trim();
    const normalizedWeekdays = Array.from(new Set(editTemplateWeekdays)).sort(
      (a, b) => a - b,
    );

    if (!normalizedTitle) {
      setEditTemplateError("Bitte geben Sie einen Titel fuer den Standard-Slot ein.");
      return;
    }
    if (editTemplateEnd <= editTemplateStart) {
      setEditTemplateError("Endzeit muss nach der Startzeit liegen.");
      return;
    }
    if (editTemplateRecurrence === "weekly" && normalizedWeekdays.length === 0) {
      setEditTemplateError(
        "Bitte waehlen Sie mindestens einen Wochentag fuer die Wiederholung.",
      );
      return;
    }

    setEditTemplatePending(true);
    try {
      const updated = await authorizedRequest<StandardSlotTemplate>(
        `/termine/templates/${editTemplateTargetId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            title: normalizedTitle,
            start: editTemplateStart,
            end: editTemplateEnd,
            status: editTemplateStatus,
            recurrence: editTemplateRecurrence,
            weekdays:
              editTemplateRecurrence === "daily" ? undefined : normalizedWeekdays,
          }),
        },
      );

      if (!isValidStandardTemplate(updated)) {
        throw new Error("Serverantwort fuer Standard-Slot ist ungueltig.");
      }

      setStandardTemplates((prev) =>
        prev.map((template) =>
          template.id === editTemplateTargetId ? updated : template,
        ),
      );
      setTemplateMessage("Standard-Slot wurde aktualisiert.");
      setEditTemplateMessage("Standard-Slot wurde aktualisiert.");
      setEditTemplateModalOpen(false);
    } catch (error) {
      setEditTemplateError(
        error instanceof Error
          ? error.message
          : "Standard-Slot konnte nicht aktualisiert werden.",
      );
    } finally {
      setEditTemplatePending(false);
    }
  };

  const handleOpenBookingModal = (slot: CalendarSlot) => {
    setBookingTargetSlot(slot);
    setBookingCustomerId("");
    setBookingName("");
    setBookingEmail("");
    setBookingPhone("");
    setBookingLink("");
    setBookingNotes("");
    setBookingError(null);
    setBookingMessage(null);
    setBookingModalOpen(true);
  };

  const handleOpenDaySlotDetails = (slot: CalendarSlot) => {
    setDaySlotDetailsSlotId(slot.id);
    setDaySlotDetailsModalOpen(true);
    setBookingError(null);
    setBookingMessage(null);
  };

  const closeDaySlotDetails = () => {
    setDaySlotDetailsModalOpen(false);
    setDaySlotDetailsSlotId(null);
  };

  const handleOpenEditFromDaySlots = (slotCandidate?: CalendarSlot | null) => {
    const targetSlot = slotCandidate ?? daySlotDetailsSlot;

    if (!targetSlot) {
      setBookingError("Bitte waehlen Sie zuerst einen Slot in Tages-Slots aus.");
      setBookingMessage(null);
      return false;
    }
    if (targetSlot.source !== "manual") {
      setBookingError(
        "Standard-Slots koennen nur ueber Standard-Slots verwaltet werden.",
      );
      setBookingMessage(null);
      return false;
    }
    const isBooked = Boolean(targetSlot.customerId || targetSlot.attendeeName);
    setEditSlotTargetId(targetSlot.id);
    setEditSlotDate(targetSlot.date);
    setEditSlotTitle(targetSlot.title);
    setEditSlotStart(targetSlot.start);
    setEditSlotEnd(targetSlot.end);
    setEditSlotLink(targetSlot.meetingLink ?? "");
    setEditSlotStatus(targetSlot.status);
    setEditSlotHasBooking(isBooked);
    setEditSlotBookedById(
      isBooked ? targetSlot.bookedById ?? defaultAdminId : "",
    );
    setEditSlotError(null);
    setEditSlotMessage(null);
    setBookingError(null);
    setBookingMessage(null);
    setEditSlotModalOpen(true);
    return true;
  };

  const handleOpenBookingFromDaySlots = (
    slotCandidate?: CalendarSlot | null,
  ) => {
    const targetSlot = slotCandidate ?? daySlotDetailsSlot;
    if (!targetSlot) {
      setBookingError("Bitte waehlen Sie zuerst einen freien Slot in Tages-Slots aus.");
      setBookingMessage(null);
      return false;
    }
    if (!isSlotBookable(targetSlot)) {
      setBookingError("Dieser Slot ist nicht mehr frei.");
      setBookingMessage(null);
      return false;
    }
    handleOpenBookingModal(targetSlot);
    return true;
  };

  const handleDeleteFromDaySlotDetails = async () => {
    if (!daySlotDetailsSlot || daySlotDetailsSlot.source !== "manual") {
      return;
    }
    const deleted = await handleDeleteSlot(daySlotDetailsSlot.id);
    if (deleted) {
      closeDaySlotDetails();
    }
  };

  const handleEditDaySlot = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEditSlotError(null);
    setEditSlotMessage(null);

    if (!editSlotTargetId) {
      setEditSlotError("Bitte waehlen Sie einen manuellen Slot zum Bearbeiten.");
      return;
    }

    const normalizedTitle = editSlotTitle.trim();
    if (!normalizedTitle) {
      setEditSlotError("Bitte geben Sie einen Titel fuer den Slot ein.");
      return;
    }
    if (editSlotEnd <= editSlotStart) {
      setEditSlotError("Endzeit muss nach der Startzeit liegen.");
      return;
    }

    const overlaps = resolveDaySlots(editSlotDate).some((slot) => {
      if (slot.source === "manual" && slot.id === editSlotTargetId) {
        return false;
      }
      return overlapsTimeRanges(editSlotStart, editSlotEnd, slot.start, slot.end);
    });
    if (overlaps) {
      setEditSlotError(
        "Dieser Zeitraum ueberschneidet sich mit einem bestehenden Slot.",
      );
      return;
    }
    if (editSlotHasBooking && employeeOptions.length > 0 && !editSlotBookedById) {
      setEditSlotError("Bitte waehlen Sie einen zugewiesenen Mitarbeiter.");
      return;
    }

    setEditSlotPending(true);
    try {
      const updated = await authorizedRequest<AppointmentSlot>(
        `/termine/slots/${editSlotTargetId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            date: editSlotDate,
            start: editSlotStart,
            end: editSlotEnd,
            title: normalizedTitle,
            status: editSlotStatus,
            meetingLink: editSlotHasBooking
              ? editSlotLink.trim() || null
              : null,
            bookedById: editSlotHasBooking ? editSlotBookedById || null : undefined,
          }),
        },
      );
      if (!isValidSlot(updated)) {
        throw new Error("Serverantwort fuer Slot ist ungueltig.");
      }

      setSlots((prev) =>
        prev.map((slot) => (slot.id === updated.id ? updated : slot)),
      );
      setDaySlotDetailsSlotId(updated.id);
      setEditSlotMessage("Tagesslot wurde aktualisiert.");
      setBookingError(null);
      setBookingMessage("Tagesslot wurde aktualisiert.");
      setEditSlotModalOpen(false);
    } catch (error) {
      setEditSlotError(
        error instanceof Error
          ? error.message
          : "Tagesslot konnte nicht aktualisiert werden.",
      );
    } finally {
      setEditSlotPending(false);
    }
  };

  const handleBookAppointment = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setBookingError(null);
    setBookingMessage(null);

    if (!bookingTargetSlot) {
      setBookingError("Bitte waehlen Sie zuerst einen freien Slot.");
      return;
    }
    if (!isSlotBookable(bookingTargetSlot)) {
      setBookingError("Dieser Slot ist nicht mehr frei.");
      return;
    }

    const normalizedName = bookingName.trim();
    const normalizedEmail = bookingEmail.trim();
    const normalizedPhone = bookingPhone.trim();
    const normalizedLink = bookingLink.trim();
    const hasCustomer = Boolean(bookingCustomerId);
    const hasManualAny = Boolean(
      normalizedName || normalizedEmail || normalizedPhone,
    );
    const hasManualAll = Boolean(
      normalizedName && normalizedEmail && normalizedPhone,
    );

    if (hasCustomer && hasManualAny) {
      setBookingError(
        "Bitte entweder Kunde auswaehlen oder Name, E-Mail und Telefon angeben.",
      );
      return;
    }
    if (!hasCustomer && !hasManualAll) {
      setBookingError(
        "Bitte entweder einen Kunden auswaehlen oder Name, E-Mail und Telefon vollstaendig ausfuellen.",
      );
      return;
    }

    setBookingPending(true);
    try {
      const payload: Record<string, unknown> = {
        bookingNotes: bookingNotes.trim() || undefined,
        status: "blocked" as SlotStatus,
        meetingLink: normalizedLink || undefined,
      };
      if (hasCustomer) {
        payload.customerId = bookingCustomerId;
      } else {
        payload.attendeeName = normalizedName;
        payload.attendeeEmail = normalizedEmail;
        payload.attendeePhone = normalizedPhone;
      }

      if (bookingTargetSlot.source === "manual") {
        const updated = await authorizedRequest<AppointmentSlot>(
          `/termine/slots/${bookingTargetSlot.id}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          },
        );
        if (!isValidSlot(updated)) {
          throw new Error("Serverantwort fuer Buchung ist ungueltig.");
        }
        setSlots((prev) =>
          prev.map((slot) => (slot.id === updated.id ? updated : slot)),
        );
      } else {
        const created = await authorizedRequest<AppointmentSlot>("/termine/slots", {
          method: "POST",
          body: JSON.stringify({
            date: bookingTargetSlot.date,
            start: bookingTargetSlot.start,
            end: bookingTargetSlot.end,
            title: bookingTargetSlot.title,
            ...payload,
          }),
        });
        if (!isValidSlot(created)) {
          throw new Error("Serverantwort fuer Buchung ist ungueltig.");
        }
        setSlots((prev) => [...prev, created]);
      }

      setBookingMessage("Termin wurde gebucht.");
      setBookingModalOpen(false);
      setBookingTargetSlot(null);
      closeDaySlotDetails();
    } catch (error) {
      setBookingError(
        error instanceof Error ? error.message : "Termin konnte nicht gebucht werden.",
      );
    } finally {
      setBookingPending(false);
    }
  };

  const handleSendReminder = async (slotId: string) => {
    setBookingError(null);
    setBookingMessage(null);
    setReminderPendingSlotId(slotId);
    try {
      const response = await authorizedRequest<ReminderResponse>(
        `/termine/slots/${slotId}/send-reminder`,
        { method: "POST" },
      );
      const updatedSlot = response?.slot;
      if (updatedSlot && isValidSlot(updatedSlot)) {
        setSlots((prev) =>
          prev.map((slot) => (slot.id === updatedSlot.id ? updatedSlot : slot)),
        );
      }
      setBookingMessage(
        response?.recipient
          ? `Erinnerungsmail wurde an ${response.recipient} gesendet.`
          : "Erinnerungsmail wurde gesendet.",
      );
    } catch (error) {
      setBookingError(
        error instanceof Error
          ? error.message
          : "Erinnerungsmail konnte nicht gesendet werden.",
      );
    } finally {
      setReminderPendingSlotId(null);
    }
  };

  const handleCreateCustomerFromSlot = async (
    slotCandidate?: CalendarSlot | null,
  ) => {
    const targetSlot = slotCandidate ?? daySlotDetailsSlot;
    if (!targetSlot) {
      setBookingError("Bitte zuerst einen Termin auswaehlen.");
      setBookingMessage(null);
      return;
    }
    if (targetSlot.source !== "manual") {
      setBookingError(
        "Kunden koennen nur aus manuell gebuchten Terminen erstellt werden.",
      );
      setBookingMessage(null);
      return;
    }
    if (targetSlot.customerId) {
      setBookingError("Dieser Termin ist bereits mit einem Kunden verknuepft.");
      setBookingMessage(null);
      return;
    }

    const hasBookingData = Boolean(
      targetSlot.attendeeName ||
        targetSlot.attendeeEmail ||
        targetSlot.attendeePhone ||
        targetSlot.bookingNotes,
    );
    if (!hasBookingData) {
      setBookingError("Fuer diesen Termin sind keine Kontaktdaten hinterlegt.");
      setBookingMessage(null);
      return;
    }

    setCreateCustomerPendingSlotId(targetSlot.id);
    setBookingError(null);
    setBookingMessage(null);

    try {
      const suggestion = await authorizedRequest<TermineCustomerSuggestionResponse>(
        `/termine/slots/${targetSlot.id}/customer-suggestion`,
        { method: "POST" },
      );

      const asTrimmed = (value: string | null | undefined) => {
        const trimmed = value?.trim();
        return trimmed ? trimmed : null;
      };
      const asEmail = (value: string | null | undefined) => {
        const normalized = asTrimmed(value)?.toLowerCase() ?? null;
        if (!normalized) return null;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
      };
      const asIsoDateTime = (value: string | null | undefined) => {
        const normalized = asTrimmed(value);
        if (!normalized) return null;
        const parsed = new Date(normalized);
        if (Number.isNaN(parsed.getTime())) return null;
        return parsed.toISOString();
      };

      const fallbackName =
        asTrimmed(suggestion.customer.name) ||
        asTrimmed(targetSlot.attendeeName) ||
        asEmail(targetSlot.attendeeEmail) ||
        `Terminkontakt ${targetSlot.date}`;

      const customerPayload: Record<string, unknown> = {
        name: fallbackName.slice(0, 191),
        type: suggestion.customer.type ?? "PRIVATE",
        marketingOptIn: Boolean(suggestion.customer.marketingOptIn),
      };

      const customerEmail =
        asEmail(suggestion.customer.email) || asEmail(targetSlot.attendeeEmail);
      const customerPhone =
        asTrimmed(suggestion.customer.phone) || asTrimmed(targetSlot.attendeePhone);
      const customerMobile = asTrimmed(suggestion.customer.mobile);
      const customerStreet = asTrimmed(suggestion.customer.street);
      const customerPostalCode = asTrimmed(suggestion.customer.postalCode);
      const customerCity = asTrimmed(suggestion.customer.city);
      const customerPreferredChannel = asTrimmed(
        suggestion.customer.preferredChannel,
      );
      const customerNotes = asTrimmed(suggestion.customer.notes)
        || asTrimmed(targetSlot.bookingNotes);
      const customerLastContactAt =
        asIsoDateTime(suggestion.customer.lastContactAt) ||
        `${targetSlot.date}T00:00:00.000Z`;
      const customerTags = Array.isArray(suggestion.customer.tags)
        ? Array.from(
            new Set(
              suggestion.customer.tags
                .map((tag) => tag.trim())
                .filter((tag) => tag.length > 0),
            ),
          ).slice(0, 5)
        : [];

      if (customerEmail) customerPayload.email = customerEmail;
      if (customerPhone) customerPayload.phone = customerPhone;
      if (customerMobile) customerPayload.mobile = customerMobile;
      if (customerStreet) customerPayload.street = customerStreet;
      if (customerPostalCode) customerPayload.postalCode = customerPostalCode;
      if (customerCity) customerPayload.city = customerCity;
      if (customerPreferredChannel) {
        customerPayload.preferredChannel = customerPreferredChannel;
      }
      if (customerNotes) customerPayload.notes = customerNotes;
      if (customerTags.length > 0) customerPayload.tags = customerTags;
      if (customerLastContactAt) {
        customerPayload.lastContactAt = customerLastContactAt;
      }

      const createdCustomer = await authorizedRequest<CustomerOption>("/customers", {
        method: "POST",
        body: JSON.stringify(customerPayload),
      });
      if (!isValidCustomerOption(createdCustomer)) {
        throw new Error("Serverantwort fuer Kundenerstellung ist ungueltig.");
      }

      const contactNameRaw =
        asTrimmed(suggestion.contact.name) ||
        asTrimmed(targetSlot.attendeeName) ||
        createdCustomer.name;
      const contactName =
        contactNameRaw.length >= 2 ? contactNameRaw : createdCustomer.name;
      const contactEmail =
        asEmail(suggestion.contact.email) ||
        asEmail(targetSlot.attendeeEmail) ||
        customerEmail;
      const contactPhone =
        asTrimmed(suggestion.contact.phone) ||
        asTrimmed(targetSlot.attendeePhone) ||
        customerPhone;
      const contactRole = asTrimmed(suggestion.contact.role);
      const contactChannel =
        asTrimmed(suggestion.contact.channel) || customerPreferredChannel;

      const contactPayload: Record<string, unknown> = {
        name: contactName.slice(0, 180),
      };
      if (contactEmail) contactPayload.email = contactEmail;
      if (contactPhone) contactPayload.phone = contactPhone;
      if (contactRole) contactPayload.role = contactRole;
      if (contactChannel) contactPayload.channel = contactChannel;

      try {
        await authorizedRequest(`/customers/${createdCustomer.id}/contacts`, {
          method: "POST",
          body: JSON.stringify(contactPayload),
        });
      } catch (error) {
        console.warn("Kontakt fuer neuen Kunden konnte nicht angelegt werden.", error);
      }

      const updatedSlot = await authorizedRequest<AppointmentSlot>(
        `/termine/slots/${targetSlot.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            customerId: createdCustomer.id,
            attendeeName: null,
            attendeeEmail: null,
            attendeePhone: null,
          }),
        },
      );
      if (!isValidSlot(updatedSlot)) {
        throw new Error("Serverantwort fuer Terminaktualisierung ist ungueltig.");
      }

      setSlots((prev) =>
        prev.map((slot) => (slot.id === updatedSlot.id ? updatedSlot : slot)),
      );
      setCustomerOptions((prev) => {
        const merged = [createdCustomer, ...prev.filter((c) => c.id !== createdCustomer.id)];
        return merged.sort((a, b) => a.name.localeCompare(b.name, "de"));
      });
      setDaySlotDetailsSlotId(updatedSlot.id);
      setBookingError(null);
      setBookingMessage(
        `Kunde "${createdCustomer.name}" wurde angelegt und mit dem Termin verknuepft.`,
      );
    } catch (error) {
      setBookingError(
        error instanceof Error
          ? error.message
          : "Kunde konnte nicht automatisch angelegt werden.",
      );
    } finally {
      setCreateCustomerPendingSlotId(null);
    }
  };

  return (
    <div className="space-y-6 px-4 py-6 lg:px-6">
      <section className="relative overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br from-cyan-500/20 via-blue-500/10 to-slate-900/40 p-6 text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.25),transparent_45%),radial-gradient(circle_at_80%_10%,rgba(59,130,246,0.25),transparent_40%)]" />
        <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-100/80">
              KI Tool
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white">
              Termine
            </h1>
            {nextAssignedSlot ? (
              <div className="mt-3 inline-flex max-w-2xl flex-col rounded-2xl border border-cyan-200/30 bg-slate-900/35 px-4 py-3 text-left">
                <p className="text-xs uppercase tracking-[0.2em] text-cyan-100/90">
                  Mein naechster Termin
                </p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {nextAssignedSlot.title}
                </p>
                <p className="mt-1 text-xs text-slate-100/80">
                  {dateFormatter.format(fromIsoDate(nextAssignedSlot.date))} -{" "}
                  {formatTimeRange(nextAssignedSlot.start, nextAssignedSlot.end)}
                </p>
                {(nextAssignedSlot.customerName || nextAssignedSlot.attendeeName) && (
                  <p className="mt-1 text-xs text-cyan-100/85">
                    Kontakt:{" "}
                    {nextAssignedSlot.customerName ??
                      nextAssignedSlot.attendeeName}
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-2 max-w-2xl text-sm text-slate-100/80">
                Aktuell ist Ihnen kein Termin zugewiesen.
              </p>
            )}
            {isCalendarBusy ? (
              <p className="mt-2 text-xs text-cyan-100/90">Termindaten werden geladen...</p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3 text-right">
            <div className="rounded-2xl border border-white/20 bg-black/20 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-200/80">
                Diese Woche
              </p>
              <p className="mt-1 text-2xl font-semibold">{freeSlotsInWeek}</p>
              <p className="text-xs text-slate-200/80">freie Slots</p>
            </div>
            <div className="rounded-2xl border border-white/20 bg-black/20 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-200/80">
                Dieser Monat
              </p>
              <p className="mt-1 text-2xl font-semibold">{freeSlotsInMonth}</p>
              <p className="text-xs text-slate-200/80">freie Slots</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Card className="border border-white/10 bg-white/5 p-5 text-white">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-200">
                <CalendarRange className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-300">
                  Kalender
                </p>
                <p className="text-lg font-semibold capitalize">
                  {monthFormatter.format(currentMonth)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="border border-white/10 bg-slate-900/40 text-slate-200 hover:bg-slate-800/70"
                onClick={() => handleMonthShift(-1)}
                disabled={isCalendarBusy}
                aria-label="Vorheriger Monat"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="border border-white/10 bg-slate-900/40 text-slate-200 hover:bg-slate-800/70"
                onClick={() => handleMonthShift(1)}
                disabled={isCalendarBusy}
                aria-label="Naechster Monat"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="border border-cyan-300/30 bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30"
                onClick={() => {
                  setSlotError(null);
                  setSlotMessage(null);
                  setSlotModalOpen(true);
                }}
                disabled={isCalendarBusy || slotPending}
                aria-label="Slot setzen"
                title="Slot setzen"
              >
                <Plus className="h-5 w-5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="border border-indigo-300/30 bg-indigo-500/20 text-indigo-100 hover:bg-indigo-500/30"
                onClick={() => {
                  setTemplateError(null);
                  setTemplateMessage(null);
                  setStandardModalOpen(true);
                }}
                disabled={isCalendarBusy || templatePending}
                aria-label="Standard-Slots"
                title="Standard-Slots"
              >
                <Repeat2 className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {WEEK_DAYS.map((weekday) => (
              <div
                key={weekday}
                className="pb-1 text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-400"
              >
                {weekday}
              </div>
            ))}
            {calendarCells.map((cell) => {
              const dayStats = slotStatsByDate.get(cell.date);
              const freeCount = dayStats?.free ?? 0;
              const blockedCount = dayStats?.blocked ?? 0;
              const isSelected = cell.date === selectedDate;

              return (
                <button
                  key={cell.date}
                  type="button"
                  onClick={() => handleSelectDate(cell.date)}
                  disabled={isCalendarBusy}
                  className={[
                    "min-h-[88px] rounded-2xl border p-2 text-left transition-all",
                    cell.inCurrentMonth
                      ? "border-white/10 bg-slate-900/40 hover:border-cyan-300/40 hover:bg-slate-800/70"
                      : "border-white/5 bg-slate-950/20 text-slate-500 hover:border-white/10",
                    isSelected
                      ? "border-cyan-300/70 bg-cyan-500/20 shadow-[0_10px_30px_-18px_rgba(6,182,212,0.9)]"
                      : "",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between">
                    <span
                      className={[
                        "inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                        cell.isToday
                          ? "bg-cyan-400 text-slate-950"
                          : "bg-white/10 text-slate-200",
                      ].join(" ")}
                    >
                      {cell.day}
                    </span>
                    {freeCount > 0 ? (
                      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                        {freeCount} frei
                      </span>
                    ) : null}
                  </div>
                  {blockedCount > 0 ? (
                    <p className="mt-2 text-[11px] text-amber-200/80">
                      {blockedCount} blockiert
                    </p>
                  ) : (
                    <p className="mt-2 text-[11px] text-slate-500"> </p>
                  )}
                </button>
              );
            })}
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="border border-white/10 bg-white/5 p-5 text-white">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/20 text-sky-200">
                  <Clock3 className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-300">
                    Tages-Slots
                  </p>
                  <p className="text-sm text-slate-300">
                    {dateFormatter.format(selectedDateObject)}
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-400">
                Karte anklicken fuer Details und Aktionen
              </p>
            </div>
            {(bookingError || bookingMessage) && (
              <p
                className={[
                  "mb-3 text-xs",
                  bookingError ? "text-rose-300" : "text-emerald-300",
                ].join(" ")}
              >
                {bookingError ?? bookingMessage}
              </p>
            )}

            {daySlots.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-white/15 bg-slate-900/30 px-4 py-5 text-sm text-slate-300">
                {isCalendarBusy
                  ? "Slots werden geladen..."
                  : "Fuer diesen Tag gibt es noch keine Slots."}
              </p>
            ) : (
              <div className="space-y-2">
                {daySlots.map((slot) => {
                  const isBooked = Boolean(slot.customerId || slot.attendeeName);
                  const primaryLabel = isBooked
                    ? slot.customerName ?? slot.attendeeName ?? slot.title
                    : slot.title;
                  return (
                    <div
                      key={slot.id}
                      className={[
                        "cursor-pointer rounded-2xl border border-white/10 bg-slate-900/40 p-3 transition-all",
                        "hover:border-cyan-300/40 hover:bg-cyan-500/10",
                      ].join(" ")}
                      onClick={() => handleOpenDaySlotDetails(slot)}
                      role="button"
                      tabIndex={0}
                      aria-label="Termindetails oeffnen"
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleOpenDaySlotDetails(slot);
                        }
                      }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">
                            {primaryLabel}
                          </p>
                          <p className="mt-1 text-xs text-slate-300">
                            {formatTimeRange(slot.start, slot.end)}
                          </p>
                        </div>
                        <span className="text-xs font-medium text-cyan-200/90">
                          Details
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Modal
        isOpen={daySlotDetailsModalOpen}
        onClose={closeDaySlotDetails}
        title="Termindetails"
        className="max-w-xl"
      >
        {daySlotDetailsSlot ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-slate-900/40 px-4 py-3">
              <p className="text-base font-semibold text-white">
                {daySlotDetailsSlot.title}
              </p>
              <p className="mt-1 text-sm text-slate-300">
                {dateFormatter.format(fromIsoDate(daySlotDetailsSlot.date))} -{" "}
                {formatTimeRange(daySlotDetailsSlot.start, daySlotDetailsSlot.end)}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span
                  className={[
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
                    daySlotDetailsSlot.customerId || daySlotDetailsSlot.attendeeName
                      ? "bg-violet-500/25 text-violet-200"
                      : daySlotDetailsSlot.status === "free"
                        ? "bg-emerald-500/20 text-emerald-200"
                        : "bg-amber-500/20 text-amber-200",
                  ].join(" ")}
                >
                  {daySlotDetailsSlot.customerId || daySlotDetailsSlot.attendeeName
                    ? "gebucht"
                    : daySlotDetailsSlot.status === "free"
                      ? "frei"
                      : "blockiert"}
                </span>
                <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-300">
                  {daySlotDetailsSlot.source === "manual" ? "Manuell" : "Standard"}
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-900/30 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-400">
                Termininfo
              </p>
              <div className="mt-2 grid gap-2 text-sm text-slate-200">
                <p>
                  <span className="text-slate-400">Kontakt:</span>{" "}
                  {daySlotDetailsSlot.customerName ??
                    daySlotDetailsSlot.attendeeName ??
                    "Noch kein Kontakt hinterlegt"}
                </p>
                {daySlotDetailsSlot.customerId || daySlotDetailsSlot.attendeeName ? (
                  <p>
                    <span className="text-slate-400">Zugewiesen an:</span>{" "}
                    {daySlotDetailsSlot.bookedById
                      ? employeeLabelsById.get(daySlotDetailsSlot.bookedById) ??
                        "Mitarbeiter unbekannt"
                      : "Nicht zugewiesen"}
                  </p>
                ) : null}
                {daySlotDetailsSlot.attendeeEmail ? (
                  <p>
                    <span className="text-slate-400">E-Mail:</span>{" "}
                    {daySlotDetailsSlot.attendeeEmail}
                  </p>
                ) : null}
                {daySlotDetailsSlot.attendeePhone ? (
                  <p>
                    <span className="text-slate-400">Telefon:</span>{" "}
                    {daySlotDetailsSlot.attendeePhone}
                  </p>
                ) : null}
                {daySlotDetailsSlot.meetingLink ? (
                  <p>
                    <span className="text-slate-400">Termin-Link:</span>{" "}
                    <a
                      href={daySlotDetailsSlot.meetingLink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-cyan-200 hover:text-cyan-100"
                    >
                      Link öffnen
                    </a>
                  </p>
                ) : null}
                {daySlotDetailsSlot.bookingNotes ? (
                  <p>
                    <span className="text-slate-400">Notiz:</span>{" "}
                    {daySlotDetailsSlot.bookingNotes}
                  </p>
                ) : null}
                {daySlotDetailsSlot.reminderSentAt ? (
                  <p>
                    <span className="text-slate-400">Letzte Erinnerung:</span>{" "}
                    {dateFormatter.format(new Date(daySlotDetailsSlot.reminderSentAt))}
                  </p>
                ) : null}
              </div>
            </div>

            {daySlotDetailsSlot.source === "standard" ? (
              <p className="text-xs text-slate-400">
                Standard-Slots bearbeiten Sie über das Repeat-Icon im Kalender.
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                className="border border-white/15 bg-transparent text-slate-200 hover:bg-white/10"
                onClick={closeDaySlotDetails}
                disabled={slotPending || bookingPending || editSlotPending}
              >
                Schliessen
              </Button>

              {isSlotBookable(daySlotDetailsSlot) ? (
                <Button
                  type="button"
                  className="bg-emerald-400 text-slate-950 hover:bg-emerald-300"
                  onClick={() => {
                    const opened = handleOpenBookingFromDaySlots(daySlotDetailsSlot);
                    if (opened) {
                      closeDaySlotDetails();
                    }
                  }}
                  disabled={bookingPending || customersLoading || isCalendarBusy}
                >
                  Termin vereinbaren
                </Button>
              ) : null}

              {daySlotDetailsSlot.source === "manual" ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="border border-cyan-300/20 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20"
                  onClick={() => {
                    const opened = handleOpenEditFromDaySlots(daySlotDetailsSlot);
                    if (opened) {
                      closeDaySlotDetails();
                    }
                  }}
                  disabled={editSlotPending || slotPending || isCalendarBusy}
                >
                  <Pencil className="mr-1 h-3.5 w-3.5" />
                  Bearbeiten
                </Button>
              ) : null}

              {daySlotDetailsSlot.source === "manual" &&
              !(daySlotDetailsSlot.customerId || daySlotDetailsSlot.attendeeName) ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="border border-white/10 bg-slate-900/30 text-slate-100 hover:bg-slate-800/60"
                  onClick={() => void handleToggleSlotStatus(daySlotDetailsSlot.id)}
                  disabled={slotPending || isCalendarBusy}
                >
                  Status wechseln
                </Button>
              ) : null}

              {daySlotDetailsSlot.source === "manual" &&
              (daySlotDetailsSlot.customerId || daySlotDetailsSlot.attendeeName) ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="border border-cyan-300/20 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20"
                  onClick={() => void handleSendReminder(daySlotDetailsSlot.id)}
                  disabled={
                    isCalendarBusy ||
                    reminderPendingSlotId === daySlotDetailsSlot.id ||
                    slotPending
                  }
                >
                  {reminderPendingSlotId === daySlotDetailsSlot.id
                    ? "Sende..."
                    : "Erinnerungsmail senden"}
                </Button>
              ) : null}

              {daySlotDetailsSlot.source === "manual" &&
              !daySlotDetailsSlot.customerId &&
              (daySlotDetailsSlot.attendeeName ||
                daySlotDetailsSlot.attendeeEmail ||
                daySlotDetailsSlot.attendeePhone ||
                daySlotDetailsSlot.bookingNotes) ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="border border-emerald-300/20 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20"
                  onClick={() => void handleCreateCustomerFromSlot(daySlotDetailsSlot)}
                  disabled={
                    isCalendarBusy ||
                    slotPending ||
                    bookingPending ||
                    createCustomerPendingSlotId === daySlotDetailsSlot.id
                  }
                >
                  {createCustomerPendingSlotId === daySlotDetailsSlot.id
                    ? "Erstelle Kunde..."
                    : "Kunde hinzufuegen (AI)"}
                </Button>
              ) : null}

              {daySlotDetailsSlot.source === "manual" ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="border border-rose-300/20 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20"
                  onClick={() => void handleDeleteFromDaySlotDetails()}
                  disabled={slotPending || isCalendarBusy}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Loeschen
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-300">Kein Slot ausgewaehlt.</p>
        )}
      </Modal>

      <Modal
        isOpen={slotModalOpen}
        onClose={() => setSlotModalOpen(false)}
        title="Slot setzen"
      >
        <p className="mb-3 text-sm text-slate-300">
          Datum: {dateFormatter.format(selectedDateObject)}
        </p>
        <form className="grid gap-3" onSubmit={handleAddSlot}>
          <label className="text-sm text-slate-200" htmlFor="slot-title-modal">
            Titel
          </label>
          <Input
            id="slot-title-modal"
            value={slotTitle}
            onChange={(event) => setSlotTitle(event.target.value)}
            className="bg-slate-900/60 text-white"
            placeholder="z. B. Erstgespraech"
            disabled={slotPending}
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm text-slate-200" htmlFor="slot-start-modal">
                Start
              </label>
              <Input
                id="slot-start-modal"
                type="time"
                value={slotStart}
                onChange={(event) => setSlotStart(event.target.value)}
                className="bg-slate-900/60 text-white"
                disabled={slotPending}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-slate-200" htmlFor="slot-end-modal">
                Ende
              </label>
              <Input
                id="slot-end-modal"
                type="time"
                value={slotEnd}
                onChange={(event) => setSlotEnd(event.target.value)}
                className="bg-slate-900/60 text-white"
                disabled={slotPending}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm text-slate-200" htmlFor="slot-status-modal">
              Typ
            </label>
            <select
              id="slot-status-modal"
              value={slotStatus}
              onChange={(event) =>
                setSlotStatus(event.target.value as SlotStatus)
              }
              disabled={slotPending}
              className="h-10 w-full rounded-md border border-white/10 bg-slate-900/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/60"
            >
              <option value="free">Frei</option>
              <option value="blocked">Blockiert</option>
            </select>
          </div>

          <div className="mt-1 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              className="border border-white/15 bg-transparent text-slate-200 hover:bg-white/10"
              onClick={() => setSlotModalOpen(false)}
              disabled={slotPending}
            >
              Schliessen
            </Button>
            <Button
              type="submit"
              className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"
              disabled={slotPending}
            >
              {slotPending ? "Speichert..." : "Slot speichern"}
            </Button>
          </div>
        </form>

        {(slotError || slotMessage) && (
          <p
            className={[
              "mt-3 text-sm",
              slotError ? "text-rose-300" : "text-emerald-300",
            ].join(" ")}
          >
            {slotError ?? slotMessage}
          </p>
        )}
      </Modal>

      <Modal
        isOpen={editSlotModalOpen}
        onClose={() => setEditSlotModalOpen(false)}
        title="Tagesslot bearbeiten"
      >
        <form className="grid gap-3" onSubmit={handleEditDaySlot}>
          <label className="text-sm text-slate-200" htmlFor="slot-edit-date-modal">
            Datum
          </label>
          <Input
            id="slot-edit-date-modal"
            type="date"
            value={editSlotDate}
            onChange={(event) => setEditSlotDate(event.target.value)}
            className="bg-slate-900/60 text-white"
            disabled={editSlotPending}
          />

          <label className="text-sm text-slate-200" htmlFor="slot-edit-title-modal">
            Titel
          </label>
          <Input
            id="slot-edit-title-modal"
            value={editSlotTitle}
            onChange={(event) => setEditSlotTitle(event.target.value)}
            className="bg-slate-900/60 text-white"
            placeholder="z. B. Erstgespraech"
            disabled={editSlotPending}
          />

          <div className="space-y-1">
            <label className="text-sm text-slate-200" htmlFor="slot-edit-link-modal">
              Termin-Link
            </label>
            <Input
              id="slot-edit-link-modal"
              type="url"
              value={editSlotLink}
              onChange={(event) => setEditSlotLink(event.target.value)}
              className="bg-slate-900/60 text-white"
              placeholder="https://meet..."
              disabled={editSlotPending || !editSlotHasBooking}
            />
            {!editSlotHasBooking ? (
              <p className="text-xs text-slate-400">
                Einen Link koennen Sie bei gebuchten Terminen setzen.
              </p>
            ) : null}
          </div>

          {editSlotHasBooking ? (
            <div className="space-y-1">
              <label
                className="text-sm text-slate-200"
                htmlFor="slot-edit-booked-by-modal"
              >
                Mitarbeiter zuweisen
              </label>
              <select
                id="slot-edit-booked-by-modal"
                value={editSlotBookedById}
                onChange={(event) => setEditSlotBookedById(event.target.value)}
                disabled={editSlotPending || employeesLoading}
                className="h-10 w-full rounded-md border border-white/10 bg-slate-900/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/60"
              >
                <option value="">
                  {employeesLoading
                    ? "Mitarbeiter werden geladen..."
                    : "Mitarbeiter auswaehlen"}
                </option>
                {employeeOptions.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {formatEmployeeLabel(employee)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-400">
                Standardzuweisung erfolgt auf den Admin-Account.
              </p>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm text-slate-200" htmlFor="slot-edit-start-modal">
                Start
              </label>
              <Input
                id="slot-edit-start-modal"
                type="time"
                value={editSlotStart}
                onChange={(event) => setEditSlotStart(event.target.value)}
                className="bg-slate-900/60 text-white"
                disabled={editSlotPending}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-slate-200" htmlFor="slot-edit-end-modal">
                Ende
              </label>
              <Input
                id="slot-edit-end-modal"
                type="time"
                value={editSlotEnd}
                onChange={(event) => setEditSlotEnd(event.target.value)}
                className="bg-slate-900/60 text-white"
                disabled={editSlotPending}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm text-slate-200" htmlFor="slot-edit-status-modal">
              Typ
            </label>
            <select
              id="slot-edit-status-modal"
              value={editSlotStatus}
              onChange={(event) =>
                setEditSlotStatus(event.target.value as SlotStatus)
              }
              disabled={editSlotPending || editSlotHasBooking}
              className="h-10 w-full rounded-md border border-white/10 bg-slate-900/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/60"
            >
              <option value="free">Frei</option>
              <option value="blocked">Blockiert</option>
            </select>
            {editSlotHasBooking && (
              <p className="text-xs text-slate-400">
                Gebuchte Slots bleiben blockiert.
              </p>
            )}
          </div>

          <div className="mt-1 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              className="border border-white/15 bg-transparent text-slate-200 hover:bg-white/10"
              onClick={() => setEditSlotModalOpen(false)}
              disabled={editSlotPending}
            >
              Schliessen
            </Button>
            <Button
              type="submit"
              className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"
              disabled={editSlotPending}
            >
              {editSlotPending ? "Speichert..." : "Aenderungen speichern"}
            </Button>
          </div>
        </form>

        {(editSlotError || editSlotMessage) && (
          <p
            className={[
              "mt-3 text-sm",
              editSlotError ? "text-rose-300" : "text-emerald-300",
            ].join(" ")}
          >
            {editSlotError ?? editSlotMessage}
          </p>
        )}
      </Modal>

      <Modal
        isOpen={standardModalOpen}
        onClose={() => setStandardModalOpen(false)}
        title="Standard-Slots"
        className="max-w-3xl"
      >
        <form className="grid gap-3" onSubmit={handleAddStandardTemplate}>
          <label className="text-sm text-slate-200" htmlFor="template-title-modal">
            Titel
          </label>
          <Input
            id="template-title-modal"
            value={templateTitle}
            onChange={(event) => setTemplateTitle(event.target.value)}
            className="bg-slate-900/60 text-white"
            placeholder="z. B. Standard Beratung"
            disabled={templatePending}
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm text-slate-200" htmlFor="template-start-modal">
                Start
              </label>
              <Input
                id="template-start-modal"
                type="time"
                value={templateStart}
                onChange={(event) => setTemplateStart(event.target.value)}
                className="bg-slate-900/60 text-white"
                disabled={templatePending}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-slate-200" htmlFor="template-end-modal">
                Ende
              </label>
              <Input
                id="template-end-modal"
                type="time"
                value={templateEnd}
                onChange={(event) => setTemplateEnd(event.target.value)}
                className="bg-slate-900/60 text-white"
                disabled={templatePending}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm text-slate-200" htmlFor="template-status-modal">
                Typ
              </label>
              <select
                id="template-status-modal"
                value={templateStatus}
                onChange={(event) =>
                  setTemplateStatus(event.target.value as SlotStatus)
                }
                disabled={templatePending}
                className="h-10 w-full rounded-md border border-white/10 bg-slate-900/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/60"
              >
                <option value="free">Frei</option>
                <option value="blocked">Blockiert</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm text-slate-200" htmlFor="template-recurrence-modal">
                Wiederholung
              </label>
              <select
                id="template-recurrence-modal"
                value={templateRecurrence}
                onChange={(event) =>
                  setTemplateRecurrence(event.target.value as RecurrenceRule)
                }
                disabled={templatePending}
                className="h-10 w-full rounded-md border border-white/10 bg-slate-900/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/60"
              >
                <option value="daily">Taeglich</option>
                <option value="weekly">Woechentlich</option>
              </select>
            </div>
          </div>

          {templateRecurrence === "weekly" && (
            <div className="space-y-2">
              <p className="text-sm text-slate-200">Wochentage</p>
              <div className="flex flex-wrap gap-2">
                {WEEK_DAYS.map((day, index) => {
                  const active = templateWeekdays.includes(index);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleTemplateWeekday(index)}
                      disabled={templatePending}
                      className={[
                        "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                        active
                          ? "border-cyan-300/70 bg-cyan-500/20 text-cyan-100"
                          : "border-white/10 bg-slate-900/30 text-slate-300 hover:border-white/30",
                      ].join(" ")}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-1 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              className="border border-white/15 bg-transparent text-slate-200 hover:bg-white/10"
              onClick={() => setStandardModalOpen(false)}
              disabled={templatePending}
            >
              Schliessen
            </Button>
            <Button
              type="submit"
              className="bg-indigo-400 text-slate-950 hover:bg-indigo-300"
              disabled={templatePending}
            >
              {templatePending ? "Speichert..." : "Standard-Slot speichern"}
            </Button>
          </div>
        </form>

        {(templateError || templateMessage) && (
          <p
            className={[
              "mt-3 text-sm",
              templateError ? "text-rose-300" : "text-emerald-300",
            ].join(" ")}
          >
            {templateError ?? templateMessage}
          </p>
        )}

        <div className="mt-5 max-h-[280px] space-y-2 overflow-y-auto pr-1">
          {standardTemplates.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/15 bg-slate-900/30 px-4 py-4 text-sm text-slate-300">
              Noch keine Standard-Slots gesetzt.
            </p>
          ) : (
            standardTemplates
              .slice()
              .sort((a, b) =>
                a.start === b.start
                  ? a.end.localeCompare(b.end)
                  : a.start.localeCompare(b.start),
              )
              .map((template) => (
                <div
                  key={template.id}
                  className="rounded-2xl border border-white/10 bg-slate-900/40 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {template.title}
                      </p>
                      <p className="mt-1 text-xs text-slate-300">
                        {formatTimeRange(template.start, template.end)}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {template.recurrence === "daily"
                          ? "Taeglich"
                          : `Woechentlich: ${formatWeekdaySelection(template.weekdays)}`}
                      </p>
                    </div>
                    <span
                      className={[
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
                        template.status === "free"
                          ? "bg-emerald-500/20 text-emerald-200"
                          : "bg-amber-500/20 text-amber-200",
                      ].join(" ")}
                    >
                      {template.status === "free" ? "frei" : "blockiert"}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 border border-cyan-300/20 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20"
                      onClick={() => handleOpenEditStandardTemplate(template)}
                      disabled={templatePending || editTemplatePending || isCalendarBusy}
                      aria-label="Standard-Slot bearbeiten"
                      title="Standard-Slot bearbeiten"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8 border border-white/10 bg-slate-900/30 px-3 text-xs text-slate-100 hover:bg-slate-800/60"
                      onClick={() => handleToggleStandardTemplateStatus(template.id)}
                      disabled={templatePending || editTemplatePending || isCalendarBusy}
                    >
                      Status wechseln
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8 border border-rose-300/20 bg-rose-500/10 px-3 text-xs text-rose-100 hover:bg-rose-500/20"
                      onClick={() => handleDeleteStandardTemplate(template.id)}
                      disabled={templatePending || editTemplatePending || isCalendarBusy}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Loeschen
                    </Button>
                  </div>
                </div>
              ))
          )}
        </div>
      </Modal>

      <Modal
        isOpen={editTemplateModalOpen}
        onClose={() => setEditTemplateModalOpen(false)}
        title="Standard-Slot bearbeiten"
        className="max-w-3xl"
      >
        <form className="grid gap-3" onSubmit={handleEditStandardTemplate}>
          <label className="text-sm text-slate-200" htmlFor="template-edit-title-modal">
            Titel
          </label>
          <Input
            id="template-edit-title-modal"
            value={editTemplateTitle}
            onChange={(event) => setEditTemplateTitle(event.target.value)}
            className="bg-slate-900/60 text-white"
            placeholder="z. B. Standard Beratung"
            disabled={editTemplatePending}
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm text-slate-200" htmlFor="template-edit-start-modal">
                Start
              </label>
              <Input
                id="template-edit-start-modal"
                type="time"
                value={editTemplateStart}
                onChange={(event) => setEditTemplateStart(event.target.value)}
                className="bg-slate-900/60 text-white"
                disabled={editTemplatePending}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-slate-200" htmlFor="template-edit-end-modal">
                Ende
              </label>
              <Input
                id="template-edit-end-modal"
                type="time"
                value={editTemplateEnd}
                onChange={(event) => setEditTemplateEnd(event.target.value)}
                className="bg-slate-900/60 text-white"
                disabled={editTemplatePending}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm text-slate-200" htmlFor="template-edit-status-modal">
                Typ
              </label>
              <select
                id="template-edit-status-modal"
                value={editTemplateStatus}
                onChange={(event) =>
                  setEditTemplateStatus(event.target.value as SlotStatus)
                }
                disabled={editTemplatePending}
                className="h-10 w-full rounded-md border border-white/10 bg-slate-900/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/60"
              >
                <option value="free">Frei</option>
                <option value="blocked">Blockiert</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm text-slate-200" htmlFor="template-edit-recurrence-modal">
                Wiederholung
              </label>
              <select
                id="template-edit-recurrence-modal"
                value={editTemplateRecurrence}
                onChange={(event) =>
                  setEditTemplateRecurrence(event.target.value as RecurrenceRule)
                }
                disabled={editTemplatePending}
                className="h-10 w-full rounded-md border border-white/10 bg-slate-900/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/60"
              >
                <option value="daily">Taeglich</option>
                <option value="weekly">Woechentlich</option>
              </select>
            </div>
          </div>

          {editTemplateRecurrence === "weekly" && (
            <div className="space-y-2">
              <p className="text-sm text-slate-200">Wochentage</p>
              <div className="flex flex-wrap gap-2">
                {WEEK_DAYS.map((day, index) => {
                  const active = editTemplateWeekdays.includes(index);
                  return (
                    <button
                      key={`template-edit-${day}`}
                      type="button"
                      onClick={() => toggleEditTemplateWeekday(index)}
                      disabled={editTemplatePending}
                      className={[
                        "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                        active
                          ? "border-cyan-300/70 bg-cyan-500/20 text-cyan-100"
                          : "border-white/10 bg-slate-900/30 text-slate-300 hover:border-white/30",
                      ].join(" ")}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-1 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              className="border border-white/15 bg-transparent text-slate-200 hover:bg-white/10"
              onClick={() => setEditTemplateModalOpen(false)}
              disabled={editTemplatePending}
            >
              Schliessen
            </Button>
            <Button
              type="submit"
              className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"
              disabled={editTemplatePending}
            >
              {editTemplatePending ? "Speichert..." : "Aenderungen speichern"}
            </Button>
          </div>
        </form>

        {(editTemplateError || editTemplateMessage) && (
          <p
            className={[
              "mt-3 text-sm",
              editTemplateError ? "text-rose-300" : "text-emerald-300",
            ].join(" ")}
          >
            {editTemplateError ?? editTemplateMessage}
          </p>
        )}
      </Modal>

      <Modal
        isOpen={bookingModalOpen}
        onClose={() => setBookingModalOpen(false)}
        title="Termin buchen"
        className="max-w-xl"
      >
        <form className="grid gap-3" onSubmit={handleBookAppointment}>
          <div className="rounded-2xl border border-white/10 bg-slate-900/40 px-4 py-3 text-sm text-slate-200">
            {bookingTargetSlot ? (
              <>
                <p className="font-semibold text-white">{bookingTargetSlot.title}</p>
                <p className="mt-1 text-xs text-slate-300">
                  {dateFormatter.format(fromIsoDate(bookingTargetSlot.date))} -{" "}
                  {formatTimeRange(bookingTargetSlot.start, bookingTargetSlot.end)}
                </p>
              </>
            ) : (
              <p>Kein Slot ausgewaehlt.</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-sm text-slate-200" htmlFor="booking-customer">
              Kunde (optional)
            </label>
            <select
              id="booking-customer"
              value={bookingCustomerId}
              onChange={(event) => {
                const nextValue = event.target.value;
                setBookingCustomerId(nextValue);
                if (nextValue) {
                  setBookingName("");
                  setBookingEmail("");
                  setBookingPhone("");
                }
              }}
              disabled={bookingPending || customersLoading}
              className="h-10 w-full rounded-md border border-white/10 bg-slate-900/60 px-3 text-sm text-white outline-none transition focus:border-emerald-300/60"
            >
              <option value="">
                {customersLoading ? "Kunden werden geladen..." : "Kunde auswaehlen"}
              </option>
              {customerOptions.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400">
              Entweder Kunde auswaehlen oder darunter Name, E-Mail und Telefon eintragen.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm text-slate-200" htmlFor="booking-name">
                Name
              </label>
              <Input
                id="booking-name"
                value={bookingName}
                onChange={(event) => setBookingName(event.target.value)}
                disabled={bookingPending || Boolean(bookingCustomerId)}
                className="bg-slate-900/60 text-white"
                placeholder="Max Mustermann"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-slate-200" htmlFor="booking-phone">
                Telefon
              </label>
              <Input
                id="booking-phone"
                value={bookingPhone}
                onChange={(event) => setBookingPhone(event.target.value)}
                disabled={bookingPending || Boolean(bookingCustomerId)}
                className="bg-slate-900/60 text-white"
                placeholder="+49 ..."
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm text-slate-200" htmlFor="booking-email">
              E-Mail
            </label>
            <Input
              id="booking-email"
              type="email"
              value={bookingEmail}
              onChange={(event) => setBookingEmail(event.target.value)}
              disabled={bookingPending || Boolean(bookingCustomerId)}
              className="bg-slate-900/60 text-white"
              placeholder="kunde@example.com"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-slate-200" htmlFor="booking-link">
              Termin-Link (optional)
            </label>
            <Input
              id="booking-link"
              type="url"
              value={bookingLink}
              onChange={(event) => setBookingLink(event.target.value)}
              disabled={bookingPending}
              className="bg-slate-900/60 text-white"
              placeholder="https://meet..."
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-slate-200" htmlFor="booking-notes">
              Notizen (optional)
            </label>
            <textarea
              id="booking-notes"
              value={bookingNotes}
              onChange={(event) => setBookingNotes(event.target.value)}
              disabled={bookingPending}
              rows={4}
              className="w-full rounded-md border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-300/60"
              placeholder="z. B. Erstberatung zu CRM-Einrichtung, Rueckruf vorab gewuenscht."
            />
          </div>

          <div className="mt-1 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              className="border border-white/15 bg-transparent text-slate-200 hover:bg-white/10"
              onClick={() => setBookingModalOpen(false)}
              disabled={bookingPending}
            >
              Schliessen
            </Button>
            <Button
              type="submit"
              className="bg-emerald-400 text-slate-950 hover:bg-emerald-300"
              disabled={bookingPending || customersLoading}
            >
              {bookingPending ? "Bucht..." : "Termin buchen"}
            </Button>
          </div>
        </form>

        {(bookingError || bookingMessage) && (
          <p
            className={[
              "mt-3 text-sm",
              bookingError ? "text-rose-300" : "text-emerald-300",
            ].join(" ")}
          >
            {bookingError ?? bookingMessage}
          </p>
        )}
      </Modal>

    </div>
  );
}
