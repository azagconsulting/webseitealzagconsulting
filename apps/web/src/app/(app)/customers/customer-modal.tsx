"use client";
import { Loader2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Customer, CustomerContact, CustomerType, VehicleFuelType, VehicleTransmission } from "@/lib/types";

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
  { label: "Privatkunde", value: "PRIVATE" },
  { label: "Gewerblich", value: "BUSINESS" },
  { label: "Flotte", value: "FLEET" },
];

const fuelTypeOptions: { label: string; value: VehicleFuelType }[] = [
  { label: "Benzin", value: "GASOLINE" },
  { label: "Diesel", value: "DIESEL" },
  { label: "Hybrid", value: "HYBRID" },
  { label: "Elektro", value: "ELECTRIC" },
  { label: "LPG", value: "LPG" },
  { label: "Sonstiges", value: "OTHER" },
];

const transmissionOptions: { label: string; value: VehicleTransmission }[] = [
  { label: "Handschaltung", value: "MANUAL" },
  { label: "Automatik", value: "AUTOMATIC" },
];

const initialState: CustomerFormState = {
  name: "",
  type: "PRIVATE",
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
    notes: customer.notes ?? "",
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

  const vehicleFieldsTouched =
    form.vehicleManufacturer.trim() ||
    form.vehicleModel.trim() ||
    form.vehicleTrim.trim() ||
    form.vehicleLicensePlate.trim() ||
    form.vehicleVin.trim() ||
    form.vehicleYear.trim() ||
    form.vehicleMileageKm.trim() ||
    form.vehicleColor.trim() ||
    form.vehicleNotes.trim() ||
    form.vehicleFuelType ||
    form.vehicleTransmission ||
    form.vehicleLastServiceAt ||
    form.vehicleNextServiceAt;

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

  function validateForm(): { totalSpendCents: number | null; vehicleYear?: number; vehicleMileageKm?: number } | null {
    const nextErrors: FormErrors = {};

    if (!form.name.trim()) {
      nextErrors.name = "Name ist erforderlich.";
    }

    if (!isEditMode && !form.type) {
      nextErrors.type = "Kundentyp wählen.";
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

    let vehicleYear: number | undefined;
    let vehicleMileageKm: number | undefined;
    if (!isEditMode && vehicleFieldsTouched) {
      if (form.vehicleYear.trim()) {
        vehicleYear = Number(form.vehicleYear);
        if (!Number.isFinite(vehicleYear)) {
          nextErrors.vehicleYear = "Ungültiges Baujahr.";
        }
      }
      if (form.vehicleMileageKm.trim()) {
        vehicleMileageKm = Number(form.vehicleMileageKm);
        if (!Number.isFinite(vehicleMileageKm) || vehicleMileageKm < 0) {
          nextErrors.vehicleMileageKm = "Ungültiger Kilometerstand.";
        }
      }
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return null;
    }

    return { totalSpendCents, vehicleYear, vehicleMileageKm };
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

    const contactPayload = contactFieldsTouched || form.contactName.trim()
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
    } else {
      if (contactPayload) {
        payload.primaryContact = contactPayload;
      }
    }

    if (!isEditMode && vehicleFieldsTouched) {
      const vehicle: Record<string, unknown> = {
        manufacturer: stringField(form.vehicleManufacturer, false),
        model: stringField(form.vehicleModel, false),
        trim: stringField(form.vehicleTrim, false),
        licensePlate: stringField(form.vehicleLicensePlate, false),
        vin: stringField(form.vehicleVin, false),
        color: stringField(form.vehicleColor, false),
        notes: stringField(form.vehicleNotes, false),
      };

      if (parsed.vehicleYear !== undefined) {
        vehicle.year = parsed.vehicleYear;
      }
      if (parsed.vehicleMileageKm !== undefined) {
        vehicle.mileageKm = parsed.vehicleMileageKm;
      }
      if (form.vehicleFuelType) {
        vehicle.fuelType = form.vehicleFuelType;
      }
      if (form.vehicleTransmission) {
        vehicle.transmission = form.vehicleTransmission;
      }
      if (form.vehicleLastServiceAt) {
        vehicle.lastServiceAt = new Date(form.vehicleLastServiceAt).toISOString();
      }
      if (form.vehicleNextServiceAt) {
        vehicle.nextServiceAt = new Date(form.vehicleNextServiceAt).toISOString();
      }

      payload.vehicles = [vehicle];
    }

      try {
        const endpoint = isEditMode && customer ? `/customers/${customer.id}` : "/customers";
        const method = isEditMode ? "PATCH" : "POST";
        const saved = await authorizedRequest<Customer>(endpoint, {
          method,
          body: JSON.stringify(payload),
        });

        if (isEditMode && customer && extraContactsPayload.length) {
          try {
            await Promise.all(
              extraContactsPayload.map((contact) =>
                authorizedRequest<CustomerContact>(`/customers/${customer.id}/contacts`, {
                  method: "POST",
                  body: JSON.stringify(contact),
                }),
              ),
            );
          } catch (err) {
            setSubmitError(err instanceof Error ? err.message : "Zusätzlicher Kontakt konnte nicht gespeichert werden.");
            setSubmitting(false);
            return;
          }
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
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Kunde</p>
          <h2 className="text-2xl font-semibold text-white">
            {isEditMode ? "Kundendaten bearbeiten" : "Neuen Kunden anlegen"}
          </h2>
          <p className="text-sm text-slate-400">
            Stammdaten, Ansprechpartner und optional das erste Fahrzeug hinterlegen.
          </p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-3xl border border-white/10 bg-white/5 p-5 space-y-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Kundendaten</p>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Name *</label>
                  <Input value={form.name} onChange={(event) => handleChange("name", event.target.value)} placeholder="Max Mustermann" />
                  {errors.name && <p className="mt-1 text-sm text-rose-300">{errors.name}</p>}
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Kundentyp</label>
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
                  <Input value={form.email} onChange={(event) => handleChange("email", event.target.value)} placeholder="kunde@example.com" />
                  {errors.email && <p className="mt-1 text-sm text-rose-300">{errors.email}</p>}
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Telefon</label>
                  <Input value={form.phone} onChange={(event) => handleChange("phone", event.target.value)} placeholder="089 ..." />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Mobil</label>
                  <Input value={form.mobile} onChange={(event) => handleChange("mobile", event.target.value)} placeholder="0176 ..." />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Bevorzugter Kanal</label>
                  <Input value={form.preferredChannel} onChange={(event) => handleChange("preferredChannel", event.target.value)} placeholder="Telefon, E-Mail ..." />
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
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Gesamtumsatz (EUR)</label>
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
                  <Input value={form.tags} onChange={(event) => handleChange("tags", event.target.value)} placeholder="Stammkunde, Reifen" />
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
                    Einwilligung für Marketing-Kontakt vorhanden
                  </label>
                </div>
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Notizen</label>
                <Textarea rows={3} value={form.notes} onChange={(event) => handleChange("notes", event.target.value)} placeholder="Vorlieben, Besonderheiten ..." />
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
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Funktion</label>
                  <Input value={form.contactRole} onChange={(event) => handleChange("contactRole", event.target.value)} placeholder="Disposition" />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">E-Mail</label>
                  <Input value={form.contactEmail} onChange={(event) => handleChange("contactEmail", event.target.value)} placeholder="ansprechpartner@example.com" />
                  {errors.contactEmail && <p className="mt-1 text-sm text-rose-300">{errors.contactEmail}</p>}
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Telefon</label>
                  <Input value={form.contactPhone} onChange={(event) => handleChange("contactPhone", event.target.value)} placeholder="040 ..." />
                </div>
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Bevorzugter Kanal</label>
                <Input value={form.contactChannel} onChange={(event) => handleChange("contactChannel", event.target.value)} placeholder="Telefon" />
              </div>

              <div className="mt-6 flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Weitere Ansprechpartner</p>
                <Button type="button" variant="ghost" className="rounded-full border border-white/10 bg-white/5 px-3 text-sm" onClick={handleAddContact}>
                  + Weiteren Ansprechpartner hinzufügen
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
                            placeholder="Sabrina Weber"
                          />
                        </div>
                        <div>
                          <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Funktion</label>
                          <Input
                            value={contact.role}
                            onChange={(e) => handleExtraChange(index, "role", e.target.value)}
                            placeholder="Disposition"
                          />
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div>
                          <label className="text-xs uppercase tracking-[0.2em] text-slate-400">E-Mail</label>
                          <Input
                            value={contact.email}
                            onChange={(e) => handleExtraChange(index, "email", e.target.value)}
                            placeholder="ansprechpartner@example.com"
                          />
                        </div>
                        <div>
                          <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Telefon</label>
                          <Input
                            value={contact.phone}
                            onChange={(e) => handleExtraChange(index, "phone", e.target.value)}
                            placeholder="040 ..."
                          />
                        </div>
                      </div>
                      <div className="mt-3">
                        <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Bevorzugter Kanal</label>
                        <Input
                          value={contact.channel}
                          onChange={(e) => handleExtraChange(index, "channel", e.target.value)}
                          placeholder="Telefon"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {!isEditMode && (
            <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Erstes Fahrzeug (optional)</p>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Hersteller</label>
                  <Input value={form.vehicleManufacturer} onChange={(event) => handleChange("vehicleManufacturer", event.target.value)} placeholder="VW" />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Modell</label>
                  <Input value={form.vehicleModel} onChange={(event) => handleChange("vehicleModel", event.target.value)} placeholder="Golf" />
                </div>
              </div>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Kennzeichen</label>
                  <Input value={form.vehicleLicensePlate} onChange={(event) => handleChange("vehicleLicensePlate", event.target.value)} placeholder="M-AH 2043" />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">VIN</label>
                  <Input value={form.vehicleVin} onChange={(event) => handleChange("vehicleVin", event.target.value)} placeholder="WVW..." />
                </div>
              </div>
              <div className="mt-3 grid gap-4 md:grid-cols-3">
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Baujahr</label>
                  <Input value={form.vehicleYear} onChange={(event) => handleChange("vehicleYear", event.target.value)} placeholder="2021" />
                  {errors.vehicleYear && <p className="mt-1 text-sm text-rose-300">{errors.vehicleYear}</p>}
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Kilometer</label>
                  <Input value={form.vehicleMileageKm} onChange={(event) => handleChange("vehicleMileageKm", event.target.value)} placeholder="56000" />
                  {errors.vehicleMileageKm && <p className="mt-1 text-sm text-rose-300">{errors.vehicleMileageKm}</p>}
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Farbe</label>
                  <Input value={form.vehicleColor} onChange={(event) => handleChange("vehicleColor", event.target.value)} placeholder="Rot" />
                </div>
              </div>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Kraftstoff</label>
                  <select
                    value={form.vehicleFuelType}
                    onChange={(event) => handleChange("vehicleFuelType", event.target.value as VehicleFuelType | "")}
                    className={selectClasses}
                  >
                    <option value="" className="bg-slate-900 text-white">
                      Keine Angabe
                    </option>
                    {fuelTypeOptions.map((option) => (
                      <option key={option.value} value={option.value} className="bg-slate-900 text-white">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Getriebe</label>
                  <select
                    value={form.vehicleTransmission}
                    onChange={(event) => handleChange("vehicleTransmission", event.target.value as VehicleTransmission | "")}
                    className={selectClasses}
                  >
                    <option value="" className="bg-slate-900 text-white">
                      Keine Angabe
                    </option>
                    {transmissionOptions.map((option) => (
                      <option key={option.value} value={option.value} className="bg-slate-900 text-white">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Letzter Service</label>
                  <Input type="datetime-local" value={form.vehicleLastServiceAt} onChange={(event) => handleChange("vehicleLastServiceAt", event.target.value)} />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Nächster Service</label>
                  <Input type="datetime-local" value={form.vehicleNextServiceAt} onChange={(event) => handleChange("vehicleNextServiceAt", event.target.value)} />
                </div>
              </div>
              <div className="mt-3">
                <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Fahrzeugnotiz</label>
                <Textarea rows={2} value={form.vehicleNotes} onChange={(event) => handleChange("vehicleNotes", event.target.value)} placeholder="Service-Hinweise ..." />
              </div>
            </section>
          )}

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
