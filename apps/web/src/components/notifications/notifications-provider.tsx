"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { clsx } from "clsx";

type NotificationVariant = "info" | "warning" | "success";

interface NotificationInput {
  title: string;
  description?: string;
  variant?: NotificationVariant;
}

interface Notification extends NotificationInput {
  id: string;
}

interface NotificationContextValue {
  notify: (input: NotificationInput) => void;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

const variantStyles: Record<NotificationVariant, string> = {
  info: "border-white/20 bg-slate-900/90",
  warning: "border-amber-400/30 bg-amber-500/10",
  success: "border-emerald-400/30 bg-emerald-500/10",
};

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const timeoutRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return;
    }
    if (Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((notification) => notification.id !== id));
    const timeout = timeoutRef.current[id];
    if (timeout) {
      clearTimeout(timeout);
      delete timeoutRef.current[id];
    }
  }, []);

  const showBrowserNotification = useCallback((input: NotificationInput) => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return;
    }
    if (Notification.permission === "granted") {
      new Notification(input.title, {
        body: input.description,
        icon: "/favicon.ico",
      });
    } else if (Notification.permission === "default") {
      Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
          new Notification(input.title, {
            body: input.description,
            icon: "/favicon.ico",
          });
        }
      });
    }
  }, []);

  const notify = useCallback(
    (input: NotificationInput) => {
      const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const payload: Notification = {
        id,
        title: input.title,
        description: input.description,
        variant: input.variant ?? "info",
      };
      setNotifications((prev) => [...prev, payload]);
      timeoutRef.current[id] = setTimeout(() => dismiss(id), 6000);
      showBrowserNotification(input);
    },
    [dismiss, showBrowserNotification],
  );

  useEffect(
    () => () => {
      Object.values(timeoutRef.current).forEach(clearTimeout);
      timeoutRef.current = {};
    },
    [],
  );

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <NotificationCenter notifications={notifications} onDismiss={dismiss} />
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications muss innerhalb des NotificationProvider verwendet werden");
  }
  return context;
}

function NotificationCenter({
  notifications,
  onDismiss,
}: {
  notifications: Notification[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-3">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={clsx(
            "pointer-events-auto w-80 rounded-2xl border px-4 py-3 text-sm text-white shadow-2xl backdrop-blur transition duration-200",
            variantStyles[notification.variant ?? "info"],
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{notification.title}</p>
              {notification.description ? (
                <p className="text-xs text-slate-200/80">{notification.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(notification.id)}
              className="rounded-full p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
              aria-label="Benachrichtigung schließen"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
