"use client";

import {
  Bot,
  Calculator,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  TrendingUp,
  LogOut,
  Menu,
  MessageSquare,
  Folder,
  Newspaper,
  Settings,
  Sparkles,
  Search,
  UserCog,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { ChatWidget } from "@/components/chat-widget";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { clsx } from "clsx";
import { WORKSPACE_NAME_STORAGE } from "@/lib/constants";
import type { WorkspaceSettings } from "@/lib/types";
import { useDriveFileUrl } from "@/hooks/use-drive-file-url";

type NavigationIcon = typeof LayoutDashboard;

interface NavigationChild {
  title: string;
  href: string;
  description: string;
  icon?: NavigationIcon;
}

interface NavigationItem {
  title: string;
  href?: string;
  icon: NavigationIcon;
  description: string;
  badge?: number;
  children?: NavigationChild[];
}

const MESSAGE_COUNTS_KEY = "workspace/messages/unread-total";
const CONTACT_REQUEST_READ_KEY = "workspace/messages/contact-requests-read";
const MESSAGE_REFRESH_INTERVAL = 60_000;

const navigationBase: NavigationItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    description: "Schneller Überblick über Leads und Aktivitäten",
  },
  {
    title: "Mitarbeiter",
    href: "/mitarbeiter",
    icon: UserCog,
    description: "People Ops, Kapazität und Hiring im Blick",
  },
  {
    title: "Kunden",
    href: "/customers",
    icon: Users,
    description: "Accounts, Beziehungen und Health",
  },
  {
    title: "Termine",
    href: "/workspace/termine",
    icon: CalendarDays,
    description: "Kalender mit frei definierbaren Slots",
  },
  {
    title: "Nachrichten",
    href: "/workspace/messages",
    icon: MessageSquare,
    description: "Inbox & E-Mails mit Kunden",
  },
  {
    title: "Drive",
    href: "/drive",
    icon: Folder,
    description: "Dateien speichern und teilen",
  },
  {
    title: "Tracking",
    href: "/tracking",
    icon: TrendingUp,
    description: "Analyse von Pageviews, CTR und Verweildauer",
  },
  {
    title: "KI Tool",
    icon: Bot,
    description: "Assistenten & Automationen",
    children: [
      {
        title: "Blog",
        href: "/workspace/blog",
        icon: Newspaper,
        description: "Beiträge verfassen und veröffentlichen",
      },
      {
        title: "Angebotskalkulator",
        href: "/workspace/angebot-kalkulator",
        icon: Calculator,
        description: "Preise, Rabatte & AI-Check",
      },
      {
        title: "Lead Finder",
        href: "/workspace/lead-finder",
        icon: Search,
        description: "Firmen recherchieren & anreichern",
      },
      {
        title: "Social Launch",
        href: "/workspace/social",
        icon: Sparkles,
        description: "Automatisierte Beiträge mit OpenAI",
      },
      {
        title: "Legal Advisor",
        href: "/workspace/legal-advisor",
        icon: Sparkles,
        description: "Informelle Ersteinschätzung mit Dokumentanhang",
      },
      {
        title: "KI Chatbot",
        href: "/workspace/ki-chatbot",
        icon: Bot,
        description: "Launcher-Sichtbarkeit auf autohausherrmann.com steuern",
      },
    ],
  },
];

const footerNavigation: NavigationItem[] = [
  {
    title: "Einstellungen",
    href: "/settings",
    icon: Settings,
    description: "Branding, Bereiche und Automationen verwalten",
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, loading, authorizedRequest, tokens } = useAuth();
  const [messagesBadge, setMessagesBadge] = useState(0);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [isDesktopViewport, setIsDesktopViewport] = useState(true);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const displayName = user?.firstName ? `${user.firstName} ${user.lastName ?? ""}`.trim() : user?.email;
  const avatarInitials = useMemo(() => {
    if (user?.firstName || user?.lastName) {
      return `${user?.firstName?.charAt(0) ?? ""}${user?.lastName?.charAt(0) ?? ""}`.toUpperCase();
    }
    return user?.email?.charAt(0).toUpperCase() ?? "?";
  }, [user?.email, user?.firstName, user?.lastName]);
  const avatarDriveId = user?.avatarUrl?.startsWith("drive:") ? user.avatarUrl.replace("drive:", "") : null;
  const { url: avatarDriveUrl } = useDriveFileUrl(avatarDriveId);
  const resolvedAvatarUrl = avatarDriveId ? avatarDriveUrl : user?.avatarUrl ?? null;

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, router, user]);

  useEffect(() => {
    if (!loading && user?.role === "CUSTOMER") {
      router.replace("/kundenportal");
    }
  }, [loading, router, user?.role]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (!user?.tenantId) {
      return;
    }
    const readLocalContactReads = () => {
      if (!user?.tenantId) return 0;
      try {
        const rawReads = window.localStorage.getItem(`${CONTACT_REQUEST_READ_KEY}/${user.tenantId}`);
        const parsed = rawReads ? JSON.parse(rawReads) : [];
        return Array.isArray(parsed) ? parsed.length : 0;
      } catch {
        return 0;
      }
    };

    const readFromStorage = () => {
      try {
        const raw = window.localStorage.getItem(MESSAGE_COUNTS_KEY);
        if (!raw) {
          setMessagesBadge(0);
          return;
        }
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const leads = (parsed.leads as Record<string, number>) ?? {};
        const unassigned = Number.isFinite(parsed.unassigned) ? Number(parsed.unassigned) : 0;
        const contactRequests = Number.isFinite(parsed.contactRequests)
          ? Number(parsed.contactRequests)
          : 0;
        const localReadCount = readLocalContactReads();
        const adjustedContactRequests = Math.max(
          0,
          contactRequests - Math.min(contactRequests, localReadCount),
        );
        const leadsTotal = Object.values(leads).reduce(
          (acc, value) => acc + (Number.isFinite(value) ? Number(value) : 0),
          0,
        );
        const total = leadsTotal + unassigned + adjustedContactRequests;
        setMessagesBadge(total);
      } catch {
        setMessagesBadge(0);
      }
    };
    readFromStorage();

    const handleCustom = (event: Event) => {
      const detail = (event as CustomEvent<{ total?: number; summary?: Record<string, unknown> }>).detail;
      if (detail?.summary && typeof detail.summary === "object") {
        const summary = detail.summary;
        const leads = (summary.leads as Record<string, number>) ?? {};
        const unassigned = Number.isFinite(summary.unassigned) ? Number(summary.unassigned) : 0;
        const contactRequests = Number.isFinite(summary.contactRequests)
          ? Number(summary.contactRequests)
          : 0;
        const localReadCount = readLocalContactReads();
        const adjustedContactRequests = Math.max(
          0,
          contactRequests - Math.min(contactRequests, localReadCount),
        );
        const leadsTotal = Object.values(leads).reduce(
          (acc, value) => acc + (Number.isFinite(value) ? Number(value) : 0),
          0,
        );
        setMessagesBadge(leadsTotal + unassigned + adjustedContactRequests);
        return;
      }
      if (detail && typeof detail.total === "number") {
        setMessagesBadge(Math.max(0, detail.total));
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === MESSAGE_COUNTS_KEY) {
        readFromStorage();
      }
    };

    window.addEventListener("workspace-messages-counts", handleCustom as EventListener);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("workspace-messages-counts", handleCustom as EventListener);
      window.removeEventListener("storage", handleStorage);
    };
  }, [user?.tenantId]);

  // Background unread polling for sidebar badge when Messages-Seite nicht aktiv ist
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (loading || !user || !tokens?.accessToken) return;
    const onMessagesPage = pathname.startsWith("/workspace/messages");
    if (onMessagesPage) return;

    let active = true;
    let controller = new AbortController();

    const persistCounts = (summary: { leads: Record<string, number>; unassigned: number; contactRequests?: number; total: number }) => {
      try {
        window.localStorage.setItem(MESSAGE_COUNTS_KEY, JSON.stringify(summary));
        window.dispatchEvent(
          new CustomEvent("workspace-messages-counts", {
            detail: { total: summary.total, summary },
          }),
        );
      } catch {
        // ignore storage issues
      }
    };

    const readLocalContactReads = () => {
      if (!user?.tenantId) return 0;
      try {
        const rawReads = window.localStorage.getItem(`${CONTACT_REQUEST_READ_KEY}/${user.tenantId}`);
        const parsed = rawReads ? JSON.parse(rawReads) : [];
        return Array.isArray(parsed) ? parsed.length : 0;
      } catch {
        return 0;
      }
    };

    const syncUnread = async () => {
      if (!active || document.visibilityState === "hidden") return;
      controller.abort();
      controller = new AbortController();
      try {
        const summary = await authorizedRequest<{
          leads: Record<string, number>;
          unassigned: number;
          contactRequests?: number;
          total: number;
        }>("/messages/unread-summary", { signal: controller.signal });
        if (!active || !summary) return;

        const leads = summary.leads ?? {};
        const unassigned = Number.isFinite(summary.unassigned) ? Number(summary.unassigned) : 0;
        const contactRequests = Number.isFinite(summary.contactRequests) ? Number(summary.contactRequests) : 0;
        const leadsTotal = Object.values(leads).reduce(
          (acc, value) => acc + (Number.isFinite(value) ? Number(value) : 0),
          0,
        );
        const computedTotal = Math.max(
          Number.isFinite(summary.total) ? Number(summary.total) : 0,
          unassigned + leadsTotal + contactRequests,
        );
        const localReadCount = readLocalContactReads();
        const adjustedContactRequests = Math.max(
          0,
          contactRequests - Math.min(contactRequests, localReadCount),
        );
        const baseSummary = { leads, unassigned, contactRequests, total: computedTotal };
        setMessagesBadge(leadsTotal + unassigned + adjustedContactRequests);
        persistCounts(baseSummary);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.warn("Unread summary refresh failed", err);
      }
    };

    void syncUnread();
    const interval = window.setInterval(syncUnread, MESSAGE_REFRESH_INTERVAL);
    const handleFocus = () => void syncUnread();
    window.addEventListener("focus", handleFocus);

    return () => {
      active = false;
      controller.abort();
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [authorizedRequest, loading, pathname, user]);

  useEffect(() => {
    setOpenDropdown(null);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = window.localStorage.getItem(WORKSPACE_NAME_STORAGE)?.trim() || null;
    if (stored) {
      setWorkspaceName(stored);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const media = window.matchMedia("(min-width: 1024px)");
    const updateViewport = () => setIsDesktopViewport(media.matches);
    const frameId = window.requestAnimationFrame(updateViewport);

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", updateViewport);
      return () => {
        window.cancelAnimationFrame(frameId);
        media.removeEventListener("change", updateViewport);
      };
    }

    media.addListener(updateViewport);
    return () => {
      window.cancelAnimationFrame(frameId);
      media.removeListener(updateViewport);
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setWorkspaceName(null);
      return;
    }

    let active = true;
    const controller = new AbortController();
    authorizedRequest<WorkspaceSettings | null>("/settings/workspace", { signal: controller.signal })
      .then((settings) => {
        if (!active || !settings) return;
        const name = settings.companyName?.trim() || settings.legalName?.trim() || null;
        setWorkspaceName(name);
        if (typeof window !== "undefined" && name) {
          window.localStorage.setItem(WORKSPACE_NAME_STORAGE, name);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
      controller.abort();
    };
  }, [authorizedRequest, user]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleWorkspaceUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ companyName?: string | null; legalName?: string | null }>).detail;
      if (!detail) return;
      const nextName = detail.companyName?.trim() || detail.legalName?.trim() || null;
      setWorkspaceName(nextName);
      if (nextName) {
        window.localStorage.setItem(WORKSPACE_NAME_STORAGE, nextName);
      } else {
        window.localStorage.removeItem(WORKSPACE_NAME_STORAGE);
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === WORKSPACE_NAME_STORAGE) {
        setWorkspaceName(event.newValue?.trim() || null);
      }
    };

    window.addEventListener("workspace-settings-updated", handleWorkspaceUpdate as EventListener);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("workspace-settings-updated", handleWorkspaceUpdate as EventListener);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  if (loading) {
    return null;
  }

  if (!user || user.role === "CUSTOMER") {
    return null;
  }

  const workspaceDisplayName = workspaceName?.trim() || "Arcto Labs";
  const effectiveSidebarCollapsed = isDesktopViewport ? sidebarCollapsed : false;

  const isItemActive = (item: NavigationItem) => {
    if (item.children?.length) {
      return item.children.some((child) => pathname.startsWith(child.href));
    }
    return item.href ? pathname.startsWith(item.href) : false;
  };

  return (
    <div className="min-h-screen text-[var(--text-primary)] lg:flex">
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-[210] flex flex-col border-r py-8 transition-all duration-300 ease-out",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
          "lg:sticky lg:top-0 lg:z-[200] lg:translate-x-0 lg:h-screen",
          effectiveSidebarCollapsed ? "lg:w-24 px-3" : "lg:w-72 px-6",
        )}
        style={{
          borderColor: "var(--panel-border)",
          background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
        }}
      >
        <div className="relative space-y-4">
          <div className="flex items-center justify-end gap-2">
            <Button
              size="icon"
              variant="ghost"
              className="lg:hidden text-[var(--text-primary)]"
              onClick={() => setSidebarOpen(false)}
              aria-label="Sidebar schließen"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          <div
            className={clsx(
              "flex flex-col items-center text-center",
              effectiveSidebarCollapsed ? "gap-2" : "gap-4",
            )}
          >
            {!effectiveSidebarCollapsed ? (
              <Logo
                className="flex-col items-center text-center text-[var(--text-primary)]"
                href="/dashboard"
                size={34}
                gapClassName="gap-1"
                label="Arcto"
              />
            ) : (
              <Logo className="text-[var(--text-primary)]" href="/dashboard" size={32} showText={false} />
            )}
          </div>
        </div>
        <nav className="mt-10 space-y-1 relative z-[210] overflow-visible">
          {navigationBase.map((item) => {
            const Icon = item.icon;
            const hasChildren = Boolean(item.children?.length);
            const isActive = isItemActive(item);
            const isDropdownOpen = hasChildren && openDropdown === item.title;
            const badge = item.href === "/workspace/messages" ? messagesBadge : item.badge;

            return (
              <div
                key={item.title}
                className="relative group"
              >
                {hasChildren ? (
                  <button
                    type="button"
                    aria-expanded={isDropdownOpen}
                    onClick={() =>
                      setOpenDropdown((current) => (current === item.title ? null : item.title))
                    }
                    className={clsx(
                      "group/button block w-full rounded-3xl border px-4 py-3 text-left transition-all",
                      isActive
                        ? "bg-[var(--nav-active-bg)] text-[var(--text-primary)] shadow-[0_18px_38px_-30px_rgba(15,23,42,0.5)]"
                        : "bg-[var(--nav-bg)] text-[var(--text-secondary)] hover:bg-[var(--nav-hover-bg)] hover:text-[var(--text-primary)]",
                      effectiveSidebarCollapsed ? "justify-center px-3 text-[var(--text-primary)] border-transparent bg-transparent shadow-none" : "",
                    )}
                    style={{
                      borderColor: isActive ? "var(--panel-border-strong)" : "var(--panel-border)",
                    }}
                  >
                    <div
                      className={clsx(
                        "flex items-center",
                        effectiveSidebarCollapsed ? "justify-center gap-0" : "gap-3",
                      )}
                    >
                      <Icon
                        className={clsx(
                          "h-5 w-5 text-[var(--text-primary)]",
                          effectiveSidebarCollapsed ? "text-[var(--text-primary)]" : "",
                        )}
                      />
                      {!effectiveSidebarCollapsed && (
                        <div className="flex flex-1 items-center justify-between gap-3">
                          <p className="text-sm font-semibold">{item.title}</p>
                          <ChevronRight
                            className={clsx(
                              "h-4 w-4 transition-transform",
                              isDropdownOpen
                                ? "rotate-90 text-[var(--text-primary)]"
                                : "text-[var(--text-secondary)]",
                            )}
                          />
                        </div>
                      )}
                    </div>
                  </button>
                ) : (
                  <Link
                    href={item.href as string}
                    className={clsx(
                      "group/link block rounded-3xl border px-4 py-3 transition-all",
                      isActive
                        ? "bg-[var(--nav-active-bg)] text-[var(--text-primary)] shadow-[0_18px_38px_-30px_rgba(15,23,42,0.5)]"
                        : "bg-[var(--nav-bg)] text-[var(--text-secondary)] hover:bg-[var(--nav-hover-bg)] hover:text-[var(--text-primary)]",
                      effectiveSidebarCollapsed ? "justify-center px-3 text-[var(--text-primary)] border-transparent bg-transparent shadow-none" : "",
                    )}
                    style={{
                      borderColor: isActive ? "var(--panel-border-strong)" : "var(--panel-border)",
                    }}
                  >
                    <div
                      className={clsx(
                        "flex items-center",
                        effectiveSidebarCollapsed ? "justify-center gap-0" : "gap-3",
                      )}
                    >
                      <Icon
                        className={clsx(
                          "h-5 w-5 text-[var(--text-primary)]",
                          effectiveSidebarCollapsed ? "text-[var(--text-primary)]" : "",
                        )}
                      />
                      {!effectiveSidebarCollapsed && (
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold">{item.title}</p>
                            {badge ? (
                              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
                                {badge}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      )}
                    </div>
                  </Link>
                )}

                {hasChildren ? (
                  <div
                    className={clsx(
                      "absolute left-[calc(100%+12px)] top-1/2 z-[999] min-w-[240px] -translate-y-1/2 rounded-3xl border bg-[var(--nav-bg)] p-2 shadow-2xl transition-all duration-150 ease-out",
                      isDropdownOpen
                        ? "pointer-events-auto opacity-100 translate-x-0"
                        : "pointer-events-none opacity-0 translate-x-2",
                    )}
                    style={{
                      borderColor: "var(--panel-border-strong)",
                      backgroundColor: "rgba(2, 6, 23, 0.98)",
                    }}
                  >
                    {item.children?.map((child) => {
                      const ChildIcon = child.icon ?? Icon;
                      const childActive = pathname.startsWith(child.href);
                      return (
                        <Link
                          key={child.title}
                          href={child.href}
                          onClick={() => setOpenDropdown(null)}
                          className={clsx(
                            "flex items-center gap-3 rounded-2xl border px-3 py-2 transition-all",
                            childActive
                              ? "bg-[var(--nav-active-bg)] text-[var(--text-primary)] shadow-[0_18px_38px_-30px_rgba(15,23,42,0.5)]"
                              : "text-[var(--text-secondary)] hover:bg-[var(--nav-hover-bg)] hover:text-[var(--text-primary)]",
                          )}
                          style={{
                            borderColor: childActive ? "var(--panel-border-strong)" : "var(--panel-border)",
                          }}
                        >
                          <ChildIcon
                            className={clsx(
                              "h-5 w-5 text-[var(--text-primary)]",
                              effectiveSidebarCollapsed ? "text-[var(--text-primary)]" : "",
                            )}
                          />
                          <p className="text-sm font-semibold">{child.title}</p>
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="mt-6 border-t border-white/10 pt-4">
          <div className="space-y-1">
            {footerNavigation.map((item) => {
              const Icon = item.icon;
              const isActive = isItemActive(item);
              const badge = item.href === "/workspace/messages" ? messagesBadge : item.badge;
              return (
                <Link
                  key={item.title}
                  href={item.href as string}
                  className={clsx(
                    "group/link block rounded-3xl border px-4 py-3 transition-all",
                    isActive
                      ? "bg-[var(--nav-active-bg)] text-[var(--text-primary)] shadow-[0_18px_38px_-30px_rgba(15,23,42,0.5)]"
                      : "bg-[var(--nav-bg)] text-[var(--text-secondary)] hover:bg-[var(--nav-hover-bg)] hover:text-[var(--text-primary)]",
                    effectiveSidebarCollapsed ? "justify-center px-3 text-[var(--text-primary)] border-transparent bg-transparent shadow-none" : "",
                  )}
                  style={{
                    borderColor: isActive ? "var(--panel-border-strong)" : "var(--panel-border)",
                  }}
                >
                  <div
                    className={clsx(
                      "flex items-center",
                      effectiveSidebarCollapsed ? "justify-center gap-0" : "gap-3",
                    )}
                  >
                    <Icon className="h-5 w-5 text-[var(--text-primary)]" />
                    {!effectiveSidebarCollapsed && (
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">{item.title}</p>
                        {badge ? (
                          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
                            {badge}
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
            <button
              type="button"
              onClick={logout}
              className={clsx(
                "group/link block w-full rounded-3xl border px-4 py-3 text-left transition-all",
                "bg-[var(--nav-bg)] text-[var(--text-secondary)] hover:bg-[var(--nav-hover-bg)] hover:text-[var(--text-primary)]",
                effectiveSidebarCollapsed ? "justify-center px-3 text-[var(--text-primary)] border-transparent bg-transparent shadow-none" : "",
              )}
              style={{ borderColor: "var(--panel-border)" }}
            >
              <div
                className={clsx(
                  "flex items-center",
                  effectiveSidebarCollapsed ? "justify-center gap-0" : "gap-3",
                )}
              >
                <LogOut className="h-5 w-5 text-[var(--text-primary)]" />
                {!effectiveSidebarCollapsed && <p className="text-sm font-semibold">Logout</p>}
              </div>
            </button>
          </div>
        </div>

        <div className="mt-4 flex justify-center">
          <Button
            size="icon"
            variant="ghost"
            className="hidden lg:flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg hover:bg-slate-800"
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            aria-label="Sidebar ein-/ausfahren"
            title="Sidebar ein-/ausfahren"
          >
            {effectiveSidebarCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
          </Button>
        </div>
      </aside>
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="sticky top-0 z-30 border-b px-4 py-4 backdrop-blur sm:px-8"
          style={{
            borderColor: "var(--panel-border-strong)",
            backgroundColor: "var(--nav-bg)",
            color: "var(--text-primary)",
          }}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button
                size="icon"
                variant="ghost"
                className="lg:hidden"
                onClick={() => setSidebarOpen(true)}
                aria-label="Sidebar öffnen"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-secondary)]">Workspace</p>
                <p className="text-sm font-semibold text-[var(--text-primary)] sm:text-lg">
                  {workspaceDisplayName}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                onClick={logout}
                aria-label="Logout"
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
              </Button>
              {user ? (
                <div
                  className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border"
                  style={{
                    borderColor: "var(--panel-border)",
                    backgroundColor: "var(--badge-bg)",
                  }}
                >
                  {resolvedAvatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={resolvedAvatarUrl} alt={displayName ?? "Profil"} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs font-semibold uppercase text-[var(--text-primary)]">{avatarInitials}</span>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 py-8 sm:px-8 lg:px-12">{children}</main>
      </div>
      <ChatWidget audience="internal" />
    </div>
  );
}
