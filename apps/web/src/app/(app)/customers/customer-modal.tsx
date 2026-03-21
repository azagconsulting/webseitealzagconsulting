"use client";

import { Loader2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  Customer,
  CustomerContact,
  CustomerType,
  VehicleFuelType,
  VehicleTransmission,
} from "@/lib/types";

export type CustomerFormState = {
  name: string;
  type: CustomerType;
  email: string;
  phone: string;
  mobile: string;
  street: string;
  postalCode: string;
  city: string;
  preferredChannel: string;
  marketingOptIn: boolean;
  notes: string;
  tags: string;
  totalSpend: string;
  lastContactAt: string;
  contactId: string;
  contactName: string;
  contactRole: string;
  contactEmail: string;
  contactChannel: string;
  contactPhone: string;
  vehicleManufacturer: string;
  vehicleModel: string;
  vehicleTrim: string;
  vehicleLicensePlate: string;
  vehicleVin: string;
  vehicleYear: string;
  vehicleMileageKm: string;
  vehicleFuelType: VehicleFuelType | "";
  vehicleTransmission: VehicleTransmission | "";
  vehicleColor: string;
  vehicleLastServiceAt: string;
  vehicleNextServiceAt: string;
  vehicleNotes: string;
};

type CustomerModalMode = "create" | "edit";
type FormErrors = Partial<Record<keyof CustomerFormState, string>>;

type ContactForm = {
  id?: string;
  name: string;
  role: string;
  email: string;
  channel: string;
  phone: string;
};

interface CustomerModalProps {
  mode: CustomerModalMode;
  open: boolean;
  customer?: Customer | null;
  prefill?: Partial<CustomerFormState> | null;
  onClose: () => void;
  onSaved: (customer: Customer) => void;
}

const customerTypeOptions: { label: string; value: CustomerType }[] = [
  { label: "B2C", value: "PRIVATE" },
  { label: "B2B", value: "BUSINESS" },
  { label: "Enterprise", value: "FLEET" },
];

const initialState: CustomerFormState = {
  name: "",
  type: "BUSINESS",
  email: "",
  phone: "",
  mobile: "",
  street: "",
  postalCode: "",
  city: "",
  preferredChannel: "",
  marketingOptIn: false,
  notes: "",
  tags: "",
  totalSpend: "",
  lastContactAt: "",
  contactId: "",
  contactName: "",
  contactRole: "",
  contactEmail: "",
  contactChannel: "",
  contactPhone: "",
  vehicleManufacturer: "",
  vehicleModel: "",
  vehicleTrim: "",
  vehicleLicensePlate: "",
  vehicleVin: "",
  vehicleYear: "",
  vehicleMileageKm: "",
  vehicleFuelType: "",
  vehicleTransmission: "",
  vehicleColor: "",
  vehicleLastServiceAt: "",
  vehicleNextServiceAt: "",
  vehicleNotes: "",
};

const selectClasses =
  "w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/40";
const ACTIVITY_PREFIX = "@activity|";

function stripActivityLines(notes?: string | null) {
  if (!notes) return "";
  return notes
    .split(/\r?\n/)
    .filter((line) => !line.startsWith(ACTIVITY_PREFIX))
    .join("\n")
    .trim();
}

function toDateTimeInput(value?: string | null) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 16);
}

function customerToFormState(customer: Customer): CustomerFormState {
  const primaryContact = customer.contacts[0];
  return {
    ...initialState,
    name: customer.name,
    type: customer.type,
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    mobile: customer.mobile ?? "",
    street: customer.street ?? "",
    postalCode: customer.postalCode ?? "",
    city: customer.city ?? "",
    preferredChannel: customer.preferredChannel ?? "",
    marketingOptIn: customer.marketingOptIn,
    notes: stripActivityLines(customer.notes),
    tags: customer.tags?.join(", ") ?? "",
    totalSpend: customer.totalSpendCents
      ? (customer.totalSpendCents / 100).toString()
      : "",
    lastContactAt: toDateTimeInput(customer.lastContactAt),
    contactId: primaryContact?.id ?? "",
    contactName: primaryContact?.name ?? "",
    contactRole: primaryContact?.role ?? "",
    contactEmail: primaryContact?.email ?? "",
    contactChannel: primaryContact?.channel ?? "",
    contactPhone: primaryContact?.phone ?? "",
  };
}

function parseEuroToCents(value: string): number | null {
  if (!value.trim()) {
    return null;
  }
  const normalized = value.replace(/[\s€]/g, "").replace(",", ".");
  const amount = Number(normalized);
  if (Number.isNaN(amount) || amount < 0) {
    return null;
  }
  return Math.round(amount * 100);
}

export function CustomerModal({ mode, open, customer, prefill, onClose, onSaved }: CustomerModalProps) {
  const { authorizedRequest } = useAuth();
  const [form, setForm] = useState<CustomerFormState>(initialState);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [additionalContacts, setAdditionalContacts] = useState<ContactForm[]>([]);
  const isEditMode = mode === "edit";

  useEffect(() => {
    if (!open) {
      setForm(initialState);
      setErrors({});
      setSubmitError(null);
      setAdditionalContacts([]);
      return;
    }

    if (isEditMode && customer) {
      setForm(customerToFormState(customer));
      const extras = (customer.contacts ?? []).slice(1).map((c) => ({
        id: c.id,
        name: c.name ?? "",
        role: c.role ?? "",
        email: c.email ?? "",
        channel: c.channel ?? "",
        phone: c.phone ?? "",
      }));
      setAdditionalContacts(extras);
    } else {
      setForm({ ...initialState, ...(prefill ?? {}) });
      setAdditionalContacts([]);
    }
    setErrors({});
    setSubmitError(null);
  }, [open, isEditMode, customer, prefill]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const tagsArray = useMemo(
    () =>
      form.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    [form.tags],
  );

  const contactFieldsTouched =
    form.contactName.trim() ||
    form.contactRole.trim() ||
    form.contactEmail.trim() ||
    form.contactChannel.trim() ||
    form.contactPhone.trim();

  const contactIsFilled = (contact: ContactForm) =>
    contact.name.trim() || contact.email.trim() || contact.phone.trim();

  function handleChange(field: keyof CustomerFormState, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }

  const handleExtraChange = (index: number, field: keyof ContactForm, value: string) => {
    setAdditionalContacts((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleAddContact = () => {
    setAdditionalContacts((prev) => [...prev, { name: "", role: "", email: "", channel: "", phone: "" }]);
  };

  const handleRemoveContact = (index: number) => {
    setAdditionalContacts((prev) => prev.filter((_, i) => i !== index));
  };

  function validateForm(): { totalSpendCents: number | null } | null {
    const nextErrors: FormErrors = {};

    if (!form.name.trim()) {
      nextErrors.name = "Name ist erforderlich.";
    }

    if (!isEditMode && !form.type) {
      nextErrors.type = "Segment wählen.";
    }

    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      nextErrors.email = "Ungültige E-Mail.";
    }

    if (form.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim())) {
      nextErrors.contactEmail = "Ungültige E-Mail.";
    }

    if (contactFieldsTouched && !form.contactName.trim()) {
      nextErrors.contactName = "Kontaktname fehlt.";
    }

    const totalSpendCents = parseEuroToCents(form.totalSpend);
    if (form.totalSpend.trim() && totalSpendCents === null) {
      nextErrors.totalSpend = "Ungültiger Betrag.";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return null;
    }

    return { totalSpendCents };
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = validateForm();
    if (!parsed) {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      type: form.type,
      marketingOptIn: form.marketingOptIn,
    };

    const stringField = (value: string, allowNull = true) => {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
      return allowNull && isEditMode ? null : undefined;
    };

    payload.email = stringField(form.email);
    payload.phone = stringField(form.phone);
    payload.mobile = stringField(form.mobile);
    payload.street = stringField(form.street);
    payload.postalCode = stringField(form.postalCode);
    payload.city = stringField(form.city);
    payload.preferredChannel = stringField(form.preferredChannel);
    payload.notes = stringField(form.notes);

    if (parsed.totalSpendCents !== null) {
      payload.totalSpendCents = parsed.totalSpendCents;
    }

    if (form.lastContactAt) {
      payload.lastContactAt = new Date(form.lastContactAt).toISOString();
    } else if (isEditMode) {
      payload.lastContactAt = null;
    }

    if (tagsArray.length > 0) {
      payload.tags = tagsArray;
    } else if (isEditMode) {
      payload.tags = [];
    }

    const contactPayload = contactFieldsTouched
      ? {
          id: form.contactId || undefined,
          name: form.contactName.trim() || form.contactEmail.trim() || form.contactPhone.trim(),
          role: stringField(form.contactRole),
          channel: stringField(form.contactChannel),
          email: stringField(form.contactEmail),
          phone: stringField(form.contactPhone),
        }
      : null;

    const extraContactsPayload = additionalContacts
      .filter((c) => contactIsFilled(c))
      .map((c) => ({
        id: c.id || undefined,
        name: c.name.trim() || c.email.trim() || c.phone.trim(),
        role: stringField(c.role),
        channel: stringField(c.channel),
        email: stringField(c.email),
        phone: stringField(c.phone),
      }))
      .filter((c) => c.name);

    if (!isEditMode) {
      if (contactPayload || extraContactsPayload.length) {
        payload.contacts = [...(contactPayload ? [contactPayload] : []), ...extraContactsPayload];
      }
    } else if (contactPayload) {
      payload.primaryContact = contactPayload;
    }

    try {
      const endpoint = isEditMode && customer ? `/customers/${customer.id}` : "/customers";
      const method = isEditMode ? "PATCH" : "POST";
      const saved = await authorizedRequest<Customer>(endpoint, {
        method,
        body: JSON.stringify(payload),
      });

      if (isEditMode && customer && extraContactsPayload.length) {
        await Promise.all(
          extraContactsPayload.map((contact) =>
            authorizedRequest<CustomerContact>(`/customers/${customer.id}/contacts`, {
              method: "POST",
              body: JSON.stringify(contact),
            }),
          ),
        );
      }

      let updatedCustomer = saved;
      if (isEditMode && customer && extraContactsPayload.length) {
        try {
          updatedCustomer = await authorizedRequest<Customer>(`/customers/${customer.id}`);
        } catch {
          updatedCustomer = saved;
        }
      }

      onSaved(updatedCustomer);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 px-4 py-8">
      <div
        className="relative w-full max-w-6xl overflow-y-auto rounded-[32px] border border-white/10 bg-slate-950/95 p-6 text-white shadow-2xl"
        style={{ maxHeight: "90vh" }}
        role="dialog"
        aria-modal="true"
        aria-label="Kunde speichern"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full border border-white/10 p-2 text-slate-300 hover:text-white"
          aria-label="Modal schließen"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-6 pr-10">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Kundenprofil</p>
          <h2 className="text-2xl font-semibold text-white">
            {isEditMode ? "Kunde bearbeiten" : "Neuen Kunden anlegen"}
          </h2>
          <p className="text-sm text-slate-400">
            Marketing-relevante Stammdaten, Ansprechpartner und Vertriebsbasis erfassen.
          </p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-3xl border border-white/10 bg-white/5 p-5 space-y-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Kundendaten</p>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Name *</label>
                  <Input value={form.name} onChange={(event) => handleChange("name", event.target.value)} placeholder="Muster GmbH" />
                  {errors.name && <p className="mt-1 text-sm text-rose-300">{errors.name}</p>}
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Segment</label>
                  <select
                    value={form.type}
                    onChange={(event) => handleChange("type", event.target.value as CustomerType)}
                    className={selectClasses}
                  >
                    {customerTypeOptions.map((option) => (
                      <option key={option.value} value={option.value} className="bg-slate-900 text-white">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">E-Mail</label>
                  <Input value={form.email} onChange={(event) => handleChange("email", event.target.value)} placeholder="kontakt@firma.de" />
                  {errors.email && <p className="mt-1 text-sm text-rose-300">{errors.email}</p>}
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Telefon</label>
                  <Input value={form.phone} onChange={(event) => handleChange("phone", event.target.value)} placeholder="+49 ..." />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Mobil</label>
                  <Input value={form.mobile} onChange={(event) => handleChange("mobile", event.target.value)} placeholder="+49 ..." />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Bevorzugter Kanal</label>
                  <Input value={form.preferredChannel} onChange={(event) => handleChange("preferredChannel", event.target.value)} placeholder="E-Mail, Telefon, WhatsApp" />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Straße</label>
                  <Input value={form.street} onChange={(event) => handleChange("street", event.target.value)} placeholder="Musterstraße 1" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs uppercase tracking-[0.2em] text-slate-400">PLZ</label>
                    <Input value={form.postalCode} onChange={(event) => handleChange("postalCode", event.target.value)} placeholder="80333" />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Ort</label>
                    <Input value={form.city} onChange={(event) => handleChange("city", event.target.value)} placeholder="München" />
                  </div>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Bisheriger Umsatz (EUR)</label>
                  <Input value={form.totalSpend} onChange={(event) => handleChange("totalSpend", event.target.value)} placeholder="0" />
                  {errors.totalSpend && <p className="mt-1 text-sm text-rose-300">{errors.totalSpend}</p>}
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Letzter Kontakt</label>
                  <Input type="datetime-local" value={form.lastContactAt} onChange={(event) => handleChange("lastContactAt", event.target.value)} />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Tags</label>
                  <Input value={form.tags} onChange={(event) => handleChange("tags", event.target.value)} placeholder="Lead, SEO, Retainer" />
                </div>
                <div className="flex items-center gap-3 pt-6">
                  <input
                    id="marketingOptIn"
                    type="checkbox"
                    checked={form.marketingOptIn}
                    onChange={(event) => handleChange("marketingOptIn", event.target.checked)}
                    className="h-4 w-4 rounded border-white/20 bg-transparent"
                  />
                  <label htmlFor="marketingOptIn" className="text-sm text-slate-300">
                    Marketing-Einwilligung vorhanden
                  </label>
                </div>
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Allgemeine Notizen</label>
                <Textarea rows={4} value={form.notes} onChange={(event) => handleChange("notes", event.target.value)} placeholder="Markenpositionierung, Zielgruppe, offene To-dos ..." />
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-5 space-y-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Ansprechpartner</p>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Name</label>
                  <Input value={form.contactName} onChange={(event) => handleChange("contactName", event.target.value)} placeholder="Sabrina Weber" />
                  {errors.contactName && <p className="mt-1 text-sm text-rose-300">{errors.contactName}</p>}
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Rolle</label>
                  <Input value={form.contactRole} onChange={(event) => handleChange("contactRole", event.target.value)} placeholder="Marketing Lead" />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">E-Mail</label>
                  <Input value={form.contactEmail} onChange={(event) => handleChange("contactEmail", event.target.value)} placeholder="ansprechpartner@firma.de" />
                  {errors.contactEmail && <p className="mt-1 text-sm text-rose-300">{errors.contactEmail}</p>}
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Telefon</label>
                  <Input value={form.contactPhone} onChange={(event) => handleChange("contactPhone", event.target.value)} placeholder="+49 ..." />
                </div>
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Bevorzugter Kanal</label>
                <Input value={form.contactChannel} onChange={(event) => handleChange("contactChannel", event.target.value)} placeholder="Slack, E-Mail, Telefon" />
              </div>

              <div className="mt-6 flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Weitere Kontakte</p>
                <Button type="button" variant="ghost" className="rounded-full border border-white/10 bg-white/5 px-3 text-sm" onClick={handleAddContact}>
                  + Ansprechpartner
                </Button>
              </div>

              {additionalContacts.length > 0 && (
                <div className="mt-3 space-y-3">
                  {additionalContacts.map((contact, index) => (
                    <div key={contact.id ?? index} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-white">Kontakt {index + 2}</p>
                        <button
                          type="button"
                          onClick={() => handleRemoveContact(index)}
                          className="rounded-full border border-white/10 p-1 text-slate-300 transition hover:border-white/30 hover:bg-white/5"
                          aria-label="Entfernen"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div>
                          <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Name</label>
                          <Input
                            value={contact.name}
                            onChange={(e) => handleExtraChange(index, "name", e.target.value)}
                            placeholder="Anna Beispiel"
                          />
                        </div>
                        <div>
                          <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Rolle</label>
                          <Input
                            value={contact.role}
                            onChange={(e) => handleExtraChange(index, "role", e.target.value)}
                            placeholder="CEO"
                          />
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div>
                          <label className="text-xs uppercase tracking-[0.2em] text-slate-400">E-Mail</label>
                          <Input
                            value={contact.email}
                            onChange={(e) => handleExtraChange(index, "email", e.target.value)}
                            placeholder="kontakt@firma.de"
                          />
                        </div>
                        <div>
                          <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Telefon</label>
                          <Input
                            value={contact.phone}
                            onChange={(e) => handleExtraChange(index, "phone", e.target.value)}
                            placeholder="+49 ..."
                          />
                        </div>
                      </div>
                      <div className="mt-3">
                        <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Kanal</label>
                        <Input
                          value={contact.channel}
                          onChange={(e) => handleExtraChange(index, "channel", e.target.value)}
                          placeholder="E-Mail"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {submitError && <p className="text-sm text-rose-300">{submitError}</p>}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Speichern
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
