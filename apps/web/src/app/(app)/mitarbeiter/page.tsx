"use client";

import {
  AlertTriangle,
  Bell,
  Calendar,
  CheckCircle2,
  Edit,
  Loader2,
  Plus,
  Tag,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AuthUser, CreateEmployeeResponse, CustomerListResponse, UserRole } from "@/lib/types";

const roleOptions: Array<{ label: string; value: UserRole; hint: string }> = [
  { label: "Admin", value: "ADMIN", hint: "Voller Zugriff, Einstellungen & Rollen" },
  { label: "Coordinator", value: "COORDINATOR", hint: "Standardrolle für CS Ops" },
  { label: "Agent", value: "AGENT", hint: "Bearbeitet Kunden & Leads" },
  { label: "Viewer", value: "VIEWER", hint: "Nur Lesezugriff" },
];

type TaskStatus = "BACKLOG" | "IN_PROGRESS" | "REVIEW" | "DONE";
type TaskPriority = "LOW" | "MEDIUM" | "HIGH";
type TaskBoard = "TEAM" | "MY";
type Task = {
  id: string;
  title: string;
  description?: string;
  customerName?: string;
  customerId?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId?: string;
  dueDate?: string;
  createdAt: string;
  board: TaskBoard;
};
type NotificationPermissionState = "default" | "granted" | "denied";

const taskColumns: Array<{ key: TaskStatus; title: string; hint: string }> = [
  { key: "BACKLOG", title: "Backlog", hint: "Ideen und anstehende Aufgaben" },
  { key: "IN_PROGRESS", title: "In Arbeit", hint: "Gerade in Bearbeitung" },
  { key: "REVIEW", title: "Review", hint: "Warten auf Abnahme oder QA" },
  { key: "DONE", title: "Erledigt", hint: "Fertiggestellt" },
];

const priorityMeta: Record<TaskPriority, { label: string; className: string }> = {
  HIGH: {
    label: "Hoch",
    className: "bg-rose-100 text-slate-900 border border-rose-300 dark:bg-rose-500/20 dark:text-rose-100 dark:border-rose-400/40",
  },
  MEDIUM: {
    label: "Mittel",
    className: "bg-amber-100 text-slate-900 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-100 dark:border-amber-400/40",
  },
  LOW: {
    label: "Niedrig",
    className: "bg-emerald-100 text-slate-900 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-100 dark:border-emerald-400/40",
  },
};
const priorityOrder: Record<TaskPriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

const initialTaskForm = {
  title: "",
  description: "",
  customerName: "",
  customerId: "",
  assigneeId: "",
  dueDate: "",
  priority: "MEDIUM" as TaskPriority,
  board: "TEAM" as TaskBoard,
};

// --- Invite Modal ---
type InviteFormState = { firstName: string; lastName: string; email: string; role: UserRole; password: string; };
const initialInviteForm: InviteFormState = { firstName: "", lastName: "", email: "", role: "COORDINATOR", password: "" };

interface InviteEmployeeModalProps {
  open: boolean;
  onClose: () => void;
  onEmployeeInvited: (employee: AuthUser) => void;
  afterContent?: React.ReactNode;
  afterContentRef?: React.RefObject<HTMLDivElement>;
}

function InviteEmployeeModal({ open, onClose, onEmployeeInvited, afterContent, afterContentRef }: InviteEmployeeModalProps) {
  const { authorizedRequest } = useAuth();
  const [inviteForm, setInviteForm] = useState(initialInviteForm);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteNotice, setInviteNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setInviteForm(initialInviteForm);
      setInviteNotice(null);
      setGeneratedPassword(null);
      setInviteLoading(false);
    }
  }, [open]);

  const handleInviteSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setInviteLoading(true);
    setInviteNotice(null);
    setGeneratedPassword(null);
    try {
      const payload = {
        firstName: inviteForm.firstName.trim() || undefined,
        lastName: inviteForm.lastName.trim() || undefined,
        email: inviteForm.email.trim().toLowerCase(),
        role: inviteForm.role,
        password: inviteForm.password.trim() || undefined,
      };

      const response = await authorizedRequest<CreateEmployeeResponse>("/users", {
        method: "POST", body: JSON.stringify(payload),
      });

      const fallbackPassword = inviteForm.password.trim() || null;
      setGeneratedPassword(response.temporaryPassword ?? fallbackPassword);

      if (response.inviteEmailSent) {
        setInviteNotice({ type: "success", text: "Mitarbeiter erstellt. Einladung per E-Mail verschickt." });
      } else if (response.inviteEmailError) {
        setInviteNotice({
          type: "error",
          text: `Account erstellt, aber E-Mail konnte nicht gesendet werden: ${response.inviteEmailError}`,
        });
      } else {
        setInviteNotice({
          type: "error",
          text: "Account erstellt, aber E-Mail wurde nicht versendet. Bitte SMTP prüfen.",
        });
      }

      onEmployeeInvited(response.user);
    } catch (err) {
      setInviteNotice({ type: "error", text: err instanceof Error ? err.message : "Einladung fehlgeschlagen." });
    } finally {
      setInviteLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 px-4 py-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6">
        <div className="relative w-full max-w-lg rounded-[32px] border border-white/10 bg-slate-950/95 p-6 text-white shadow-2xl">
          <div className="mb-6 pr-10">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Team</p>
            <h2 className="text-2xl font-semibold text-white">Mitarbeiter einladen</h2>
            <p className="text-sm text-slate-400">Passwort automatisch generieren oder selbst definieren.</p>
          </div>
          <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-full border border-white/10 p-2 text-slate-300 hover:text-white" aria-label="Modal schließen" >
            <X className="h-4 w-4" />
          </button>
          
          <form className="space-y-4" onSubmit={handleInviteSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm text-slate-300">Vorname <Input className="mt-2" value={inviteForm.firstName} onChange={(e) => setInviteForm(f => ({...f, firstName: e.target.value}))} placeholder="Mara" /></label>
                <label className="text-sm text-slate-300">Nachname <Input className="mt-2" value={inviteForm.lastName} onChange={(e) => setInviteForm(f => ({...f, lastName: e.target.value}))} placeholder="Schneider" /></label>
              </div>
              <label className="text-sm text-slate-300">E-Mail <Input type="email" className="mt-2" value={inviteForm.email} onChange={(e) => setInviteForm(f => ({...f, email: e.target.value}))} placeholder="mara@arcto.app" required /></label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm text-slate-300">
                  Rolle
                  <select className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-sky-400 focus:outline-none" value={inviteForm.role} onChange={(e) => setInviteForm(f => ({...f, role: e.target.value as UserRole}))}>
                    {roleOptions.map((option) => (<option key={option.value} value={option.value}>{option.label}</option>))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">{roleOptions.find((role) => role.value === inviteForm.role)?.hint}</p>
                </label>
                <label className="text-sm text-slate-300">
                  Passwort (optional)
                  <Input type="password" className="mt-2" value={inviteForm.password} onChange={(e) => setInviteForm(f => ({...f, password: e.target.value}))} placeholder="leer für Autogenerierung" />
                </label>
              </div>
              {inviteNotice && <p className={clsx("text-xs", inviteNotice.type === "success" ? "text-emerald-300" : "text-rose-300")}>{inviteNotice.text}</p>}
              {generatedPassword && <p className="text-xs text-sky-300">Temporäres Passwort: <span className="font-mono">{generatedPassword}</span></p>}
              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="ghost" onClick={onClose}>Abbrechen</Button>
                <Button type="submit" disabled={inviteLoading}>{inviteLoading ? <Loader2 className="h-4 w-4 animate-spin"/> : <UserPlus className="h-4 w-4" />} Einladung senden</Button>
              </div>
          </form>
        </div>
        {afterContent ? <div ref={afterContentRef} className="w-full pb-4">{afterContent}</div> : null}
      </div>
    </div>
  );
}

// --- Edit Modal ---
type EditFormState = { firstName: string; lastName: string; role: UserRole; };

interface EditEmployeeModalProps {
  open: boolean;
  employee: AuthUser | null;
  onClose: () => void;
  onEmployeeUpdated: (employee: AuthUser) => void;
}

function EditEmployeeModal({ open, employee, onClose, onEmployeeUpdated }: EditEmployeeModalProps) {
    const { authorizedRequest } = useAuth();
    const [form, setForm] = useState<EditFormState>({ firstName: '', lastName: '', role: 'AGENT' });
    const [loading, setLoading] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);

    useEffect(() => {
        if(open && employee) {
            setForm({
                firstName: employee.firstName ?? '',
                lastName: employee.lastName ?? '',
                role: employee.role,
            });
            setNotice(null);
            setLoading(false);
        }
    }, [open, employee]);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if(!employee) return;
        setLoading(true);
        setNotice(null);

        try {
            const payload = {
                firstName: form.firstName.trim() || undefined,
                lastName: form.lastName.trim() || undefined,
                role: form.role,
            };
            const updated = await authorizedRequest<AuthUser>(`/users/${employee.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
            onEmployeeUpdated(updated);
        } catch(err) {
            setNotice(err instanceof Error ? err.message : 'Update fehlgeschlagen.');
        } finally {
            setLoading(false);
        }
    }

    if(!open || !employee) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 px-4 py-8">
          <div className="relative w-full max-w-lg rounded-[32px] border border-white/10 bg-slate-950/95 p-6 text-white shadow-2xl">
            <div className="mb-6 pr-10">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Mitarbeiter bearbeiten</p>
              <h2 className="text-2xl font-semibold text-white">{employee.firstName} {employee.lastName}</h2>
              <p className="text-sm text-slate-400">{employee.email}</p>
            </div>
            <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-full border border-white/10 p-2 text-slate-300 hover:text-white" aria-label="Modal schließen" >
              <X className="h-4 w-4" />
            </button>
            
            <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm text-slate-300">Vorname <Input className="mt-2" value={form.firstName} onChange={(e) => setForm(f => ({...f, firstName: e.target.value}))} /></label>
                  <label className="text-sm text-slate-300">Nachname <Input className="mt-2" value={form.lastName} onChange={(e) => setForm(f => ({...f, lastName: e.target.value}))} /></label>
                </div>
                <label className="text-sm text-slate-300">
                    Rolle
                    <select className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-sky-400 focus:outline-none" value={form.role} onChange={(e) => setForm(f => ({...f, role: e.target.value as UserRole}))}>
                        {roleOptions.map((option) => (<option key={option.value} value={option.value}>{option.label}</option>))}
                    </select>
                </label>
                {notice && <p className="text-xs text-rose-300">{notice}</p>}
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="ghost" onClick={onClose}>Abbrechen</Button>
                  <Button type="submit" disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin"/> : null} Speichern</Button>
                </div>
            </form>
          </div>
        </div>
    );
}

export default function MitarbeiterPage() {
  const { authorizedRequest, user } = useAuth();
  const searchParams = useSearchParams();
  const searchParamString = searchParams?.toString();
  const isAdmin = user?.role === "ADMIN";
  const [employees, setEmployees] = useState<AuthUser[]>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInviteModalOpen, setInviteModalOpen] = useState(false);
  const [showAccessSection, setShowAccessSection] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<AuthUser | null>(null);
  const [highlightAccess, setHighlightAccess] = useState(false);
  const accessSectionRef = useRef<HTMLDivElement>(null!);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionState>("default");
  const [tasksByBoard, setTasksByBoard] = useState<Record<TaskBoard, Task[]>>({ TEAM: [], MY: [] });
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskForm, setTaskForm] = useState(initialTaskForm);
  const [taskNotice, setTaskNotice] = useState<string | null>(null);
  const [isTaskModalOpen, setTaskModalOpen] = useState(false);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const [activeBoard, setActiveBoard] = useState<TaskBoard>("TEAM");
  const [taskDeleteConfirm, setTaskDeleteConfirm] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof document === "undefined") return true;
    return document.documentElement.classList.contains("dark");
  });

  const employeeNameById = useMemo(() => {
    const map: Record<string, string> = {};
    employees.forEach((emp) => {
      const name = emp.firstName || emp.lastName ? `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim() : emp.email;
      map[emp.id] = name || emp.email;
    });
    return map;
  }, [employees]);
  const myUserId = user?.id;

  const normalizeTask = (task: any): Task => ({
    id: task.id,
    title: task.title,
    description: task.description ?? undefined,
    customerName: task.customerName ?? task.customer?.name ?? undefined,
    customerId: task.customerId ?? task.customer?.id ?? undefined,
    status: task.status as TaskStatus,
    priority: task.priority as TaskPriority,
    assigneeId: task.assigneeId ?? task.assignee?.id ?? undefined,
    dueDate: task.dueDate ?? undefined,
    createdAt: task.createdAt ?? new Date().toISOString(),
    board: (task.board as TaskBoard) ?? "TEAM",
  });

  useEffect(() => {
    const controller = new AbortController();
    async function fetchEmployees() {
      setLoading(true);
      setError(null);
      try {
        const data = await authorizedRequest<AuthUser[]>("/users", { signal: controller.signal });
        setEmployees(data);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError(err instanceof Error ? err.message : "Mitarbeiter konnten nicht geladen werden.");
        }
      } finally {
        setLoading(false);
      }
    }
    void fetchEmployees();
    return () => controller.abort();
  }, [authorizedRequest]);

  useEffect(() => {
    const controller = new AbortController();
    async function fetchCustomers() {
      try {
        const data = await authorizedRequest<CustomerListResponse>("/customers?limit=100", { signal: controller.signal });
        setCustomers((data?.items ?? []).map((c) => ({ id: c.id, name: c.name })));
      } catch {
        // optional enhancement, ignore errors to not block UI
      }
    }
    void fetchCustomers();
    return () => controller.abort();
  }, [authorizedRequest]);

  const loadTasks = useCallback(
    async (board: TaskBoard) => {
      setTasksLoading(true);
      try {
        const data = await authorizedRequest<unknown[]>(`/tasks?board=${board}`);
        setTasksByBoard((current) => ({ ...current, [board]: (data ?? []).map(normalizeTask) }));
      } catch (err) {
        setTaskNotice(err instanceof Error ? err.message : "Tasks konnten nicht geladen werden.");
      } finally {
        setTasksLoading(false);
      }
    },
    [authorizedRequest],
  );

  useEffect(() => {
    if (!user) return;
    void loadTasks(activeBoard);
  }, [activeBoard, loadTasks, user]);

  useEffect(() => {
    setTaskForm((f) => ({ ...f, board: activeBoard }));
  }, [activeBoard]);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setNotificationPermission(Notification.permission as NotificationPermissionState);
    if (Notification.permission === "default") {
      Notification.requestPermission().then((permission) => {
        setNotificationPermission(permission as NotificationPermissionState);
      });
    }
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const update = () => setIsDarkMode(document.documentElement.classList.contains("dark"));
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const sortedEmployees = useMemo(() => {
    return [...employees].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [employees]);

  const focusAccessSection = () => {
    if (!accessSectionRef.current) return;
    accessSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    setHighlightAccess(true);
    window.setTimeout(() => setHighlightAccess(false), 1200);
  };

  useEffect(() => {
    if (showAccessSection) {
      focusAccessSection();
    }
  }, [showAccessSection]);

  useEffect(() => {
    const params = new URLSearchParams(searchParamString ?? "");
    const wantsInvite = params.get("invite") === "1";
    const wantsAccessTab = params.get("tab") === "zugang" || wantsInvite;

    if (wantsAccessTab) {
      setShowAccessSection(true);
      focusAccessSection();
    }
    if (wantsInvite && isAdmin) {
      setInviteModalOpen(true);
    }
  }, [isAdmin, searchParamString]);

  const handleEmployeeInvited = (newEmployee: AuthUser) => {
    setEmployees((current) => [newEmployee, ...current]);
    setTimeout(() => {
      setInviteModalOpen(false);
      setShowAccessSection(false);
    }, 1500);
  };

  const handleEmployeeUpdated = (updatedEmployee: AuthUser) => {
    setEmployees(current => current.map(e => e.id === updatedEmployee.id ? updatedEmployee : e));
    setEditingEmployee(null);
  };

  const handleDelete = async (employeeId: string) => {
    if (!window.confirm("Soll dieser Mitarbeiter wirklich gelöscht werden?")) return;
    
    try {
        await authorizedRequest(`/users/${employeeId}`, { method: 'DELETE' });
        setEmployees(current => current.filter(e => e.id !== employeeId));
    } catch(err) {
        setError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.');
    }
  }

  const triggerTaskNotification = useCallback((task: Task) => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const title = `Neue Aufgabe: ${task.title}`;
    const body = task.assigneeId
      ? `Zugewiesen an ${employeeNameById[task.assigneeId] ?? "Team"}.`
      : "Keine Zuordnung – bitte übernehmen.";

    if (Notification.permission === "granted") {
      // eslint-disable-next-line no-new
      new Notification(title, { body, tag: task.id });
    } else if (Notification.permission === "default") {
      Notification.requestPermission().then((permission) => {
        setNotificationPermission(permission as NotificationPermissionState);
        if (permission === "granted") {
          // eslint-disable-next-line no-new
          new Notification(title, { body, tag: task.id });
        }
      });
    }
  }, [employeeNameById]);

  const handleTaskSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!taskForm.title.trim()) {
      setTaskNotice("Bitte einen Titel vergeben.");
      return;
    }
    try {
      const selectedCustomer = customers.find((c) => c.id === taskForm.customerId);
      const payloadCustomerName = taskForm.customerName.trim() || selectedCustomer?.name;
      const bodyPayload = {
        title: taskForm.title.trim(),
        description: taskForm.description.trim() || undefined,
        customerName: payloadCustomerName || undefined,
        customerId: taskForm.customerId || undefined,
        priority: taskForm.priority,
        assigneeId: taskForm.assigneeId || undefined,
        dueDate: taskForm.dueDate || undefined,
        board: taskForm.board,
      };

      if (editingTask) {
        const updatedResponse = await authorizedRequest<unknown>(`/tasks/${editingTask.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyPayload),
        });
        const updated = normalizeTask(updatedResponse);
        updateTaskInState(updated);
        setTaskNotice("Aufgabe aktualisiert.");
      } else {
        const createdResponse = await authorizedRequest<unknown>("/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyPayload),
        });
        const created = normalizeTask(createdResponse);
        setTasksByBoard((current) => ({
          ...current,
          [created.board]: [created, ...(current[created.board] ?? [])],
        }));
        setTaskNotice("Aufgabe angelegt.");
        triggerTaskNotification(created);
      }

      setTaskForm((f) => ({ ...initialTaskForm, board: f.board }));
      setEditingTask(null);
      setTaskModalOpen(false);
    } catch (err) {
      setTaskNotice(err instanceof Error ? err.message : "Aufgabe konnte nicht erstellt werden.");
    }
  };

  const findTaskById = (taskId: string) => {
    const boardKeys: TaskBoard[] = ["TEAM", "MY"];
    for (const board of boardKeys) {
      const found = tasksByBoard[board]?.find((task) => task.id === taskId);
      if (found) return found;
    }
    return undefined;
  };

  const updateTaskInState = (updatedTask: Task) => {
    setTasksByBoard((current) => {
      const boardKeys: TaskBoard[] = ["TEAM", "MY"];
      const nextState: Record<TaskBoard, Task[]> = { ...current };
      boardKeys.forEach((board) => {
        nextState[board] = (nextState[board] ?? []).filter((task) => task.id !== updatedTask.id);
      });
      const targetBoard = updatedTask.board;
      nextState[targetBoard] = [updatedTask, ...(nextState[targetBoard] ?? [])];
      return nextState;
    });
  };

  const handleTaskStatusChange = async (taskId: string, status: TaskStatus) => {
    const existing = findTaskById(taskId);
    if (!existing) return;
    try {
      const updatedResponse = await authorizedRequest<unknown>(`/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      updateTaskInState(normalizeTask(updatedResponse));
    } catch (err) {
      setTaskNotice(err instanceof Error ? err.message : "Status konnte nicht geändert werden.");
    }
  };

  const handleTaskAssigneeChange = async (taskId: string, assigneeId: string) => {
    const existing = findTaskById(taskId);
    if (!existing) return;
    try {
      const updatedResponse = await authorizedRequest<unknown>(`/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeId: assigneeId || null }),
      });
      updateTaskInState(normalizeTask(updatedResponse));
    } catch (err) {
      setTaskNotice(err instanceof Error ? err.message : "Zuweisung konnte nicht geändert werden.");
    }
  };

  const handleTaskCustomerChange = async (taskId: string, customerId: string) => {
    const existing = findTaskById(taskId);
    if (!existing) return;
    try {
      const updatedResponse = await authorizedRequest<unknown>(`/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: customerId || null }),
      });
      const normalized = normalizeTask(updatedResponse);
      if (!normalized.customerName && customerId) {
        normalized.customerName = customers.find((c) => c.id === customerId)?.name;
      }
      updateTaskInState(normalized);
    } catch (err) {
      setTaskNotice(err instanceof Error ? err.message : "Kunde konnte nicht verknüpft werden.");
    }
  };

  const openTaskEdit = (task: Task) => {
    setTaskForm({
      title: task.title,
      description: task.description ?? "",
      customerName: task.customerName ?? "",
      customerId: task.customerId ?? "",
      assigneeId: task.assigneeId ?? "",
      dueDate: task.dueDate ?? "",
      priority: task.priority,
      board: task.board,
    });
    setEditingTask(task);
    setTaskModalOpen(true);
  };

  const handleTaskDelete = async (taskId: string) => {
    const existing = findTaskById(taskId);
    if (!existing) return;
    try {
      await authorizedRequest(`/tasks/${taskId}`, { method: "DELETE" });
      setTasksByBoard((current) => {
        const next: Record<TaskBoard, Task[]> = { ...current };
        (Object.keys(next) as TaskBoard[]).forEach((board) => {
          next[board] = (next[board] ?? []).filter((task) => task.id !== taskId);
        });
        return next;
      });
      setTaskDeleteConfirm(null);
    } catch (err) {
      setTaskNotice(err instanceof Error ? err.message : "Löschen fehlgeschlagen.");
    }
  };

  const handleDragStart = (taskId: string, event?: React.DragEvent<HTMLDivElement>) => {
    const target = event?.target as HTMLElement | null;
    if (target?.closest("select, option, button, input, textarea, label")) {
      event?.preventDefault();
      return;
    }
    setDragTaskId(taskId);
  };

  const handleDragEnd = () => {
    setDragTaskId(null);
    setDragOverColumn(null);
  };

  const handleColumnDragOver = (event: React.DragEvent<HTMLDivElement>, status: TaskStatus) => {
    event.preventDefault();
    if (dragOverColumn !== status) {
      setDragOverColumn(status);
    }
  };

  const handleDropOnColumn = async (status: TaskStatus) => {
    if (!dragTaskId) return;
    await handleTaskStatusChange(dragTaskId, status);
    setDragTaskId(null);
    setDragOverColumn(null);
  };

  useEffect(() => {
    if (!taskNotice) return;
    const timeout = window.setTimeout(() => setTaskNotice(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [taskNotice]);

  const filteredTasks = useMemo(() => {
    return tasksByBoard[activeBoard] ?? [];
  }, [tasksByBoard, activeBoard]);

  const tasksByStatus = useMemo(() => {
    const grouped: Record<TaskStatus, Task[]> = {
      BACKLOG: [],
      IN_PROGRESS: [],
      REVIEW: [],
      DONE: [],
    };
    filteredTasks.forEach((task) => {
      grouped[task.status]?.push(task);
    });
    return grouped;
  }, [filteredTasks]);

  const openTasks = filteredTasks.filter((task) => task.status !== "DONE").length;

  const renderAccessSection = () => (
    <div
      className={clsx(
        "w-full rounded-[32px] border border-white/10 bg-slate-950/95 p-6 text-white shadow-2xl",
        "transition-shadow",
        highlightAccess && "shadow-[0_0_0_2px_rgba(56,189,248,0.5)]",
      )}
    >
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Team</p>
          <h3 className="text-xl font-semibold text-white">Zugänge & Aktivitäten</h3>
          <p className="text-sm text-slate-400">Wer nutzt das CRM? Alle Accounts transparent in einer Liste.</p>
        </div>
        <div className="text-xs text-slate-400">
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-slate-300" /> : `${employees.length} Einträge`}
        </div>
      </div>
      {error && <p className="mb-3 text-xs text-rose-300"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />{error}</p>}
      <div className="max-h-[52vh] space-y-4 overflow-y-auto pr-1 sm:pr-2">
        {loading && <p className="flex items-center gap-2 text-sm text-slate-300"><Loader2 className="h-4 w-4 animate-spin" /> Mitarbeiter werden geladen...</p>}
        {!loading && sortedEmployees.length === 0 && <p className="text-sm text-slate-400">Noch keine Zugänge vorhanden.</p>}
        {sortedEmployees.map((employee) => (
          <div key={employee.id} className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
            <div className="overflow-x-auto">
              <div className="flex min-w-[620px] items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-white">{employee.firstName ? `${employee.firstName} ${employee.lastName ?? ""}`.trim() : employee.email}</p>
                  <p className="text-xs text-slate-400">{employee.email}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-white/80">{employee.role.toLowerCase()}</span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingEmployee(employee)}
                    >
                      <Edit className="h-4 w-4" /> Bearbeiten
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-rose-300 hover:text-rose-200"
                      onClick={() => handleDelete(employee.id)}
                      disabled={user?.id === employee.id}
                      title={user?.id === employee.id ? "Eigener Zugang kann nicht gelöscht werden." : undefined}
                    >
                      <Trash2 className="h-4 w-4" /> Löschen
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Team</p>
            <h1 className="text-3xl font-semibold text-white">Mitarbeiter</h1>
            <p className="text-sm text-slate-400">Kolleg:innen hinzufügen und Zugänge verwalten.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setTaskForm((f) => ({ ...initialTaskForm, board: activeBoard, assigneeId: f.assigneeId }));
                setEditingTask(null);
                setTaskModalOpen(true);
              }}
              className="border-white/20 text-white hover:border-sky-400"
            >
              <Plus className="h-4 w-4" /> Aufgabe erstellen
            </Button>
            {isAdmin ? (
              <Button
                size="sm"
                onClick={() => {
                  setShowAccessSection(true);
                  focusAccessSection();
                  setInviteModalOpen(true);
                }}
              >
                <UserPlus className="h-4 w-4" /> Mitarbeiter einladen
              </Button>
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          <div
            className={clsx(
              "flex flex-wrap items-center gap-3 rounded-3xl border px-4 py-3 text-sm",
              isDarkMode ? "border-white/10 bg-white/5 text-slate-200" : "border-slate-200 bg-white text-slate-900",
            )}
          >
            <div className="flex flex-wrap gap-2">
              <span
                className={clsx(
                  "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs",
                  isDarkMode ? "bg-sky-500/10 text-sky-200" : "bg-sky-100 text-sky-700",
                )}
              >
                <Users className="h-4 w-4" /> {employees.length} Mitarbeitende
              </span>
              <span
                className={clsx(
                  "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs",
                  isDarkMode ? "bg-amber-500/10 text-amber-200" : "bg-amber-100 text-amber-700",
                )}
              >
                <Tag className="h-4 w-4" /> {openTasks} offene Aufgaben
              </span>
              <span
                className={clsx(
                  "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs",
                  isDarkMode ? "bg-emerald-500/10 text-emerald-200" : "bg-emerald-100 text-emerald-700",
                )}
              >
                <CheckCircle2 className="h-4 w-4" /> {tasksByStatus.DONE.length} erledigt
              </span>
            </div>
            <div className="flex gap-2">
              {(["TEAM", "MY"] as const).map((boardKey) => (
                <button
                  key={boardKey}
                  type="button"
                  onClick={() => setActiveBoard(boardKey)}
                  className={clsx(
                    "rounded-full px-3 py-1 text-xs font-medium transition",
                    activeBoard === boardKey
                      ? isDarkMode
                        ? "bg-sky-500/20 text-white border border-sky-400/50"
                        : "bg-sky-100 text-slate-900 border border-sky-300"
                      : isDarkMode
                        ? "bg-white/5 text-slate-300 border border-white/10 hover:border-sky-400/40"
                        : "bg-white text-slate-700 border border-slate-200 hover:border-sky-400/40",
                  )}
                >
                  {boardKey === "TEAM" ? "Teamboard" : "Mein Board"}
                </button>
              ))}
              {tasksLoading && (
                <Loader2 className={clsx("h-4 w-4 animate-spin", isDarkMode ? "text-slate-300" : "text-slate-500")} />
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 min-h-[75vh] max-h-[calc(100vh-180px)] overflow-hidden">
            {taskColumns.map((column) => {
              const columnTasks = tasksByStatus[column.key] ?? [];
              const sortedColumnTasks = [...columnTasks].sort((a, b) => {
                const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
                if (priorityDiff !== 0) return priorityDiff;
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
              });
              return (
                <div
                  key={column.key}
                  className={clsx(
                    "flex h-full flex-col overflow-hidden rounded-3xl p-4 text-sm shadow-xl",
                    isDarkMode
                      ? "border border-white/10 bg-slate-900/70 text-slate-200"
                      : "border border-slate-200 bg-white text-slate-900",
                    dragOverColumn === column.key && "border-sky-400/60 shadow-[0_0_0_2px_rgba(56,189,248,0.25)]",
                  )}
                  onDragOver={(e) => handleColumnDragOver(e, column.key)}
                  onDrop={() => handleDropOnColumn(column.key)}
                  onDragLeave={() => setDragOverColumn(null)}
                >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p
                          className={clsx(
                            "text-xs uppercase tracking-[0.3em]",
                            isDarkMode ? "text-slate-400" : "text-slate-500",
                          )}
                        >
                          {column.hint}
                        </p>
                        <h4 className={clsx("text-lg font-semibold", isDarkMode ? "text-white" : "text-slate-900")}>
                          {column.title}
                        </h4>
                      </div>
                      <span
                        className={clsx(
                          "rounded-full px-2.5 py-1 text-xs",
                          isDarkMode ? "bg-white/10 text-slate-200" : "bg-slate-100 text-slate-700",
                        )}
                      >
                        {columnTasks.length}
                      </span>
                    </div>
                    <div className="mt-4 flex-1 space-y-3 overflow-auto pr-2">
                      {columnTasks.length === 0 && (
                        <p className={clsx("text-xs", isDarkMode ? "text-slate-400" : "text-slate-600")}>
                          Keine Aufgaben in diesem Schritt.
                        </p>
                      )}
                    {sortedColumnTasks.map((task) => (
                      <div
                        key={task.id}
                        className={clsx(
                          "relative rounded-2xl border p-4 text-sm shadow-sm",
                          isDarkMode
                            ? "border-white/10 bg-slate-900/70 text-slate-200"
                            : "border-slate-200 bg-white text-slate-900",
                          dragTaskId === task.id && "border-sky-400/50",
                        )}
                        draggable
                        onDragStart={(e) => handleDragStart(task.id, e)}
                        onDragEnd={handleDragEnd}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <p className={clsx("font-semibold", isDarkMode ? "text-white" : "text-slate-900")}>{task.title}</p>
                            {task.customerName && (
                              <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-3 py-1 text-[11px] text-sky-100">
                                <Users className="h-3 w-3" />
                                {task.customerName}
                              </p>
                            )}
                            {task.description && (
                              <p className={clsx("mt-1 line-clamp-3 text-xs", isDarkMode ? "text-slate-400" : "text-slate-600")}>
                                {task.description}
                              </p>
                            )}
                          </div>
                          <div className="flex items-start gap-2">
                            <span
                              className={clsx(
                                "rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide shadow-sm",
                                priorityMeta[task.priority].className,
                              )}
                              style={!isDarkMode ? { color: "#0f172a" } : undefined}
                            >
                              {priorityMeta[task.priority].label}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openTaskEdit(task);
                              }}
                              className={clsx(
                                "rounded-full p-1 text-slate-300 hover:bg-white/5 hover:text-white",
                                !isDarkMode && "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
                              )}
                              aria-label="Aufgabe bearbeiten"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setTaskDeleteConfirm((current) => (current === task.id ? null : task.id))
                              }
                              className="rounded-full p-1 text-slate-300 hover:bg-white/5 hover:text-white"
                              aria-label="Aufgabe löschen"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        {taskDeleteConfirm === task.id && (
                          <div className="absolute right-2 top-2 z-20 w-48 rounded-xl border border-white/15 bg-slate-950/95 p-3 text-xs text-slate-100 shadow-2xl">
                            <p className="font-semibold text-white">Löschen?</p>
                            <p className="mt-1 text-[11px] text-slate-400">Dieser Task wird entfernt.</p>
                            <div className="mt-2 flex justify-end gap-2">
                              <button
                                type="button"
                                className="rounded-lg border border-white/10 px-3 py-1 text-[11px] text-slate-200 hover:border-sky-400/60"
                                onClick={() => setTaskDeleteConfirm(null)}
                              >
                                Abbrechen
                              </button>
                              <button
                                type="button"
                                className="rounded-lg bg-rose-500/15 px-3 py-1 text-[11px] font-semibold text-rose-200 hover:bg-rose-500/25"
                                onClick={() => handleTaskDelete(task.id)}
                              >
                                Löschen
                              </button>
                            </div>
                          </div>
                        )}
                        <div
                          className={clsx(
                            "mt-3 flex flex-wrap items-center gap-2 text-xs",
                            isDarkMode ? "text-slate-300" : "text-slate-600",
                          )}
                        >
                          <span
                            className={clsx(
                              "inline-flex items-center gap-1 rounded-full px-3 py-1",
                              isDarkMode ? "bg-white/10" : "bg-slate-100 text-slate-800",
                            )}
                          >
                            <Users className="h-3.5 w-3.5" />
                            {task.assigneeId ? employeeNameById[task.assigneeId] ?? "Zugewiesen" : "Unzugewiesen"}
                          </span>
                          {task.dueDate && (
                            <span
                              className={clsx(
                                "inline-flex items-center gap-1 rounded-full px-3 py-1",
                                isDarkMode ? "bg-white/10" : "bg-slate-100 text-slate-800",
                              )}
                            >
                              <Calendar className="h-3.5 w-3.5" />
                              {new Date(task.dueDate).toLocaleDateString("de-DE")}
                            </span>
                          )}
                          <span
                            className={clsx(
                              "inline-flex items-center gap-1 rounded-full px-3 py-1",
                              isDarkMode ? "bg-white/10" : "bg-slate-100 text-slate-800",
                            )}
                          >
                            <Tag className="h-3.5 w-3.5" />
                            Erstellt {new Date(task.createdAt).toLocaleDateString("de-DE")}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <label className={clsx("text-xs", isDarkMode ? "text-slate-300" : "text-slate-700")}>
                            Zuständig
                            <select
                              className={clsx(
                                "mt-1 w-full rounded-2xl px-3 py-2 text-xs shadow-lg focus:outline-none",
                                isDarkMode
                                  ? "border border-white/15 bg-slate-900/90 text-white focus:border-sky-400"
                                  : "border border-slate-300 bg-white text-slate-900 focus:border-sky-500",
                              )}
                              value={task.assigneeId ?? ""}
                              onChange={(e) => handleTaskAssigneeChange(task.id, e.target.value)}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <option value="">Offen</option>
                              {employees.map((emp) => (
                                <option key={emp.id} value={emp.id}>
                                  {employeeNameById[emp.id] ?? emp.email}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className={clsx("text-xs", isDarkMode ? "text-slate-300" : "text-slate-700")}>
                            Kunde
                            <select
                              className={clsx(
                                "mt-1 w-full rounded-2xl px-3 py-2 text-xs shadow-lg focus:outline-none",
                                isDarkMode
                                  ? "border border-white/15 bg-slate-900/90 text-white focus:border-sky-400"
                                  : "border border-slate-300 bg-white text-slate-900 focus:border-sky-500",
                              )}
                              value={task.customerId ?? ""}
                              onChange={(e) => handleTaskCustomerChange(task.id, e.target.value)}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <option value="">Kein Kunde</option>
                              {customers.map((customer) => (
                                <option key={customer.id} value={customer.id}>
                                  {customer.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {isAdmin ? (
        <InviteEmployeeModal
          open={isInviteModalOpen}
          onClose={() => {
            setInviteModalOpen(false);
            setShowAccessSection(false);
          }}
          onEmployeeInvited={handleEmployeeInvited}
          afterContent={isInviteModalOpen && showAccessSection ? renderAccessSection() : null}
          afterContentRef={accessSectionRef}
        />
      ) : null}

      {isTaskModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 px-4 py-8">
          <div
            className={clsx(
              "relative w-full max-w-2xl rounded-[28px] border p-6 shadow-2xl",
              isDarkMode ? "border-white/10 bg-slate-950/95 text-white" : "border-slate-200 bg-white text-slate-900",
            )}
          >
            <div className="mb-4 pr-10">
              <p className={clsx("text-xs uppercase tracking-[0.3em]", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                Aufgabenplaner
              </p>
              <h3 className={clsx("text-2xl font-semibold", isDarkMode ? "text-white" : "text-slate-900")}>
                {editingTask ? "Aufgabe bearbeiten" : "Neue Aufgabe erstellen"}
              </h3>
              <p className={clsx("text-sm", isDarkMode ? "text-slate-400" : "text-slate-600")}>
                Titel, Beschreibung, Priorität und Zuständige festlegen.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingTask(null);
                setTaskModalOpen(false);
              }}
              className={clsx(
                "absolute right-4 top-4 rounded-full border p-2",
                isDarkMode
                  ? "border-white/10 text-slate-300 hover:text-white"
                  : "border-slate-200 text-slate-500 hover:text-slate-900",
              )}
              aria-label="Modal schließen"
            >
              <X className="h-4 w-4" />
            </button>
            <form className="space-y-3" onSubmit={handleTaskSubmit}>
              <label className={clsx("block text-sm", isDarkMode ? "text-slate-300" : "text-slate-700")}>
                Titel
                <Input
                  className={clsx(
                    "mt-2 shadow-sm",
                    isDarkMode
                      ? "border border-white/10 bg-white/5 text-white placeholder:text-slate-500"
                      : "border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400",
                  )}
                  value={taskForm.title}
                  onChange={(e) => setTaskForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Follow-up an ACME senden"
                  required
                />
              </label>
              <label className={clsx("block text-sm", isDarkMode ? "text-slate-300" : "text-slate-700")}>
                Kunde (optional)
                <Input
                  className={clsx(
                    "mt-2 shadow-sm",
                    isDarkMode
                      ? "border border-white/10 bg-white/5 text-white placeholder:text-slate-500"
                      : "border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400",
                  )}
                  value={taskForm.customerName}
                  onChange={(e) => setTaskForm((f) => ({ ...f, customerName: e.target.value }))}
                  placeholder="Kunde oder Firma hinzufügen"
                />
              </label>
              <label className={clsx("block text-sm", isDarkMode ? "text-slate-300" : "text-slate-700")}>
                Kunde verknüpfen
                <select
                  className={clsx(
                    "mt-2 w-full rounded-2xl px-4 py-3 text-sm shadow-lg focus:outline-none",
                    isDarkMode
                      ? "border border-white/10 bg-slate-900/80 text-white focus:border-sky-400"
                      : "border border-slate-300 bg-white text-slate-900 focus:border-sky-500",
                  )}
                  value={taskForm.customerId}
                  onChange={(e) => setTaskForm((f) => ({ ...f, customerId: e.target.value }))}
                >
                  <option value="">Kein Kunde</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
                <p className={clsx("mt-1 text-xs", isDarkMode ? "text-slate-500" : "text-slate-500")}>
                  Optional: verknüpft den Task mit einem bestehenden Kunden.
                </p>
              </label>
              <label className={clsx("block text-sm", isDarkMode ? "text-slate-300" : "text-slate-700")}>
                Beschreibung
                <Textarea
                  className={clsx(
                    "mt-2 shadow-sm",
                    isDarkMode
                      ? "border border-white/10 bg-white/5 text-white placeholder:text-slate-500"
                      : "border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400",
                  )}
                  rows={3}
                  value={taskForm.description}
                  onChange={(e) => setTaskForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Kontext, Links oder Checkliste hinzufügen..."
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={clsx("block text-sm", isDarkMode ? "text-slate-300" : "text-slate-700")}>
                  Fällig
                  <Input
                    className={clsx(
                      "mt-2 shadow-sm",
                      isDarkMode
                        ? "border border-white/10 bg-white/5 text-white placeholder:text-slate-500"
                        : "border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400",
                    )}
                    type="date"
                    value={taskForm.dueDate}
                    onChange={(e) => setTaskForm((f) => ({ ...f, dueDate: e.target.value }))}
                  />
                </label>
                <label className={clsx("block text-sm", isDarkMode ? "text-slate-300" : "text-slate-700")}>
                  Priorität
                  <select
                    className={clsx(
                      "mt-2 w-full rounded-2xl px-4 py-3 text-sm focus:outline-none shadow-sm",
                      isDarkMode
                        ? "border border-white/10 bg-white/5 text-white focus:border-sky-400"
                        : "border border-slate-300 bg-white text-slate-900 focus:border-sky-500",
                    )}
                    value={taskForm.priority}
                    onChange={(e) => setTaskForm((f) => ({ ...f, priority: e.target.value as TaskPriority }))}
                  >
                    <option value="HIGH">Hoch</option>
                    <option value="MEDIUM">Mittel</option>
                    <option value="LOW">Niedrig</option>
                  </select>
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={clsx("block text-sm", isDarkMode ? "text-slate-300" : "text-slate-700")}>
                  Zuständig
                  <select
                    className={clsx(
                      "mt-2 w-full rounded-2xl px-4 py-3 text-sm focus:outline-none shadow-sm",
                      isDarkMode
                        ? "border border-white/10 bg-white/5 text-white focus:border-sky-400"
                        : "border border-slate-300 bg-white text-slate-900 focus:border-sky-500",
                    )}
                    value={taskForm.assigneeId}
                    onChange={(e) => setTaskForm((f) => ({ ...f, assigneeId: e.target.value }))}
                  >
                    <option value="">Noch nicht zugewiesen</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {employeeNameById[emp.id] ?? emp.email}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={clsx("block text-sm", isDarkMode ? "text-slate-300" : "text-slate-700")}>
                  Board
                  <select
                    className={clsx(
                      "mt-2 w-full rounded-2xl px-4 py-3 text-sm focus:outline-none shadow-sm",
                      isDarkMode
                        ? "border border-white/10 bg-white/5 text-white focus:border-sky-400"
                        : "border border-slate-300 bg-white text-slate-900 focus:border-sky-500",
                    )}
                    value={taskForm.board}
                    onChange={(e) => setTaskForm((f) => ({ ...f, board: e.target.value as Task["board"] }))}
                  >
                    <option value="TEAM">Teamboard</option>
                    <option value="MY">Mein Board</option>
                  </select>
                </label>
              </div>
              {taskNotice && <p className="text-xs text-emerald-300">{taskNotice}</p>}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEditingTask(null);
                    setTaskModalOpen(false);
                  }}
                >
                  Abbrechen
                </Button>
                <Button type="submit">
                  {editingTask ? <Edit className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{" "}
                  {editingTask ? "Speichern" : "Aufgabe erstellen"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <EditEmployeeModal
        open={!!editingEmployee}
        onClose={() => setEditingEmployee(null)}
        employee={editingEmployee}
        onEmployeeUpdated={handleEmployeeUpdated}
      />
    </>
  );
}
