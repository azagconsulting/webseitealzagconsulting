"use client";

import { clsx } from "clsx";
import {
  Bell,
  BellOff,
  Circle,
  Download,
  Loader2,
  MessageCircleMore,
  MessageSquare,
  Paperclip,
  Plus,
  Send,
  Users,
  UserRound,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

import { useAuth } from "@/components/auth-provider";
import { useNotifications } from "@/components/notifications/notifications-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { authHeaders, buildApiUrl } from "@/lib/api";
import type {
  ChatAttachment,
  ChatAttachmentUploadResponse,
  ChatConversationType,
  ChatConversationChangedEvent,
  ChatConversationSummary,
  ChatMessage,
  ChatMessageListResponse,
  ChatReadStateSummary,
  ChatTypingUpdatedEvent,
  CustomerListResponse,
} from "@/lib/types";

interface ChatWidgetProps {
  audience?: "internal" | "customer";
}

type ChatMessageCreatedEvent = {
  conversationId?: string;
  message?: ChatMessage;
};

type ChatReadUpdatedEvent = {
  conversationId?: string;
  state?: {
    userId: string;
    lastReadMessageId?: string | null;
    lastReadAt?: string | null;
    updatedAt?: string;
  };
};

type ListRefreshOptions = {
  silent?: boolean;
};

const socketBaseUrl = normalizeBase(process.env.NEXT_PUBLIC_API_URL);
const CHAT_DESKTOP_ALERTS_KEY = "arcto-chat-desktop-alerts";
const CHAT_SOUND_ALERTS_KEY = "arcto-chat-sound-alerts";

type ChatConversationFilter = "ALL" | ChatConversationType;

function normalizeBase(value?: string | null) {
  if (!value) {
    return "";
  }
  return value.trim().replace(/\/$/, "");
}

function resolveSocketBaseUrl() {
  if (!socketBaseUrl) {
    return "";
  }
  if (typeof window === "undefined") {
    return socketBaseUrl;
  }

  try {
    const parsed = new URL(socketBaseUrl);
    if (window.location.protocol === "https:" && parsed.protocol !== "https:") {
      return "";
    }
    return socketBaseUrl;
  } catch {
    return "";
  }
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target.isContentEditable
  );
}

function playNotificationBeep() {
  if (typeof window === "undefined") {
    return;
  }
  const AudioCtx =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) {
    return;
  }

  const context = new AudioCtx();
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = 880;
  gain.gain.value = 0.0001;
  oscillator.connect(gain);
  gain.connect(context.destination);

  const now = context.currentTime;
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
  oscillator.start(now);
  oscillator.stop(now + 0.24);
  oscillator.onended = () => {
    void context.close();
  };
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function formatRelativeTime(value?: string | null) {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function formatBytes(size?: number | null) {
  if (!size || size <= 0) {
    return "0 B";
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getConversationIcon(conversation: ChatConversationSummary) {
  if (conversation.type === "TEAM") {
    return Users;
  }
  if (conversation.type === "DIRECT") {
    return UserRound;
  }
  return MessageSquare;
}

function extractDriveAvatarId(value?: string | null) {
  if (!value?.startsWith("drive:")) {
    return null;
  }
  const id = value.replace("drive:", "").trim();
  return id || null;
}

function getInitials(value?: string | null) {
  const text = value?.trim() ?? "";
  if (!text) {
    return "?";
  }
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.charAt(0) ?? ""}${parts[1]?.charAt(0) ?? ""}`.toUpperCase();
  }
  return text.charAt(0).toUpperCase();
}

export function ChatWidget({ audience = "internal" }: ChatWidgetProps) {
  const { user, tokens, authorizedRequest } = useAuth();
  const { notify } = useNotifications();
  const socketRef = useRef<Socket | null>(null);
  const refreshTimerRef = useRef<number | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeConversationRef = useRef<string | null>(null);
  const panelOpenRef = useRef(false);
  const activeConversationTitleRef = useRef<string | null>(null);
  const lastMarkedMessageRef = useRef<string>("");
  const suppressAutoScrollRef = useRef(false);
  const typingStopTimerRef = useRef<number | null>(null);
  const typingStateRef = useRef<{ conversationId: string | null; isTyping: boolean }>({
    conversationId: null,
    isTyping: false,
  });
  const avatarLoadingIdsRef = useRef<Set<string>>(new Set());
  const avatarObjectUrlsRef = useRef<Record<string, string>>({});
  const desktopAlertsRef = useRef(true);
  const soundAlertsRef = useRef(true);

  const [isOpen, setIsOpen] = useState(false);
  const [isListOpenMobile, setIsListOpenMobile] = useState(false);
  const [socketOnline, setSocketOnline] = useState(false);

  const [conversations, setConversations] = useState<ChatConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [nextMessagesBefore, setNextMessagesBefore] = useState<string | null>(null);
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
  const [readStatesByConversation, setReadStatesByConversation] = useState<
    Record<string, ChatReadStateSummary[]>
  >({});
  const [typingByConversation, setTypingByConversation] = useState<
    Record<string, Record<string, string>>
  >({});
  const [avatarByDriveId, setAvatarByDriveId] = useState<Record<string, string>>({});

  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);

  const [draft, setDraft] = useState("");
  const [conversationQuery, setConversationQuery] = useState("");
  const [conversationFilter, setConversationFilter] = useState<ChatConversationFilter>("ALL");
  const [desktopAlertsEnabled, setDesktopAlertsEnabled] = useState(true);
  const [soundAlertsEnabled, setSoundAlertsEnabled] = useState(true);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [employeeOptions, setEmployeeOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [customerOptions, setCustomerOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [directUserId, setDirectUserId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [showDirectForm, setShowDirectForm] = useState(false);
  const [showCustomerForm, setShowCustomerForm] = useState(false);

  const isCustomerUser = user?.role === "CUSTOMER";
  const customerMode = audience === "customer" || isCustomerUser;

  useEffect(() => {
    panelOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    activeConversationRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    desktopAlertsRef.current = desktopAlertsEnabled;
  }, [desktopAlertsEnabled]);

  useEffect(() => {
    soundAlertsRef.current = soundAlertsEnabled;
  }, [soundAlertsEnabled]);

  const canRender = useMemo(() => {
    if (!user) {
      return false;
    }
    if (audience === "customer") {
      return user.role === "CUSTOMER";
    }
    if (audience === "internal") {
      return user.role !== "CUSTOMER";
    }
    return true;
  }, [audience, user]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const desktopValue = window.localStorage.getItem(CHAT_DESKTOP_ALERTS_KEY);
    const soundValue = window.localStorage.getItem(CHAT_SOUND_ALERTS_KEY);
    setDesktopAlertsEnabled(desktopValue !== "0");
    setSoundAlertsEnabled(soundValue !== "0");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      CHAT_DESKTOP_ALERTS_KEY,
      desktopAlertsEnabled ? "1" : "0",
    );
  }, [desktopAlertsEnabled]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      CHAT_SOUND_ALERTS_KEY,
      soundAlertsEnabled ? "1" : "0",
    );
  }, [soundAlertsEnabled]);

  useEffect(() => {
    if (!canRender || typeof window === "undefined") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      let rawKey: unknown;
      let rawCode: unknown;
      let ctrlKey = false;
      let shiftKey = false;
      let target: EventTarget | null = null;
      try {
        rawKey = Reflect.get(event as object, "key");
        rawCode = Reflect.get(event as object, "code");
        ctrlKey = Boolean(Reflect.get(event as object, "ctrlKey"));
        shiftKey = Boolean(Reflect.get(event as object, "shiftKey"));
        target = (Reflect.get(event as object, "target") as EventTarget | null) ?? null;
      } catch {
        return;
      }

      const key = (
        (typeof rawKey === "string" && rawKey) ||
        (typeof rawCode === "string" && rawCode) ||
        ""
      ).toLowerCase();
      if (!key) {
        return;
      }

      if (
        ctrlKey &&
        shiftKey &&
        key === "c"
      ) {
        event.preventDefault();
        setIsOpen((current) => !current);
        return;
      }

      if (key === "escape" && isOpen) {
        event.preventDefault();
        setIsOpen(false);
        setIsListOpenMobile(false);
        return;
      }

      if (
        ctrlKey &&
        shiftKey &&
        key === "f" &&
        !customerMode
      ) {
        event.preventDefault();
        setIsOpen(true);
        window.setTimeout(() => {
          searchInputRef.current?.focus();
        }, 0);
        return;
      }

      if (isTypingTarget(target)) {
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [canRender, customerMode, isOpen]);

  const activeConversation = useMemo(
    () => conversations.find((entry) => entry.id === activeConversationId) ?? null,
    [activeConversationId, conversations],
  );

  useEffect(() => {
    activeConversationTitleRef.current = activeConversation?.title ?? null;
  }, [activeConversation?.title]);

  const totalUnread = useMemo(
    () => conversations.reduce((sum, conversation) => sum + Math.max(0, conversation.unreadCount ?? 0), 0),
    [conversations],
  );

  const visibleConversations = useMemo(() => {
    const query = conversationQuery.trim().toLowerCase();
    return conversations.filter((conversation) => {
      if (conversationFilter !== "ALL" && conversation.type !== conversationFilter) {
        return false;
      }
      if (!query) {
        return true;
      }
      const haystack = [
        conversation.title,
        conversation.customerName ?? "",
        conversation.directUser?.displayName ?? "",
        conversation.lastMessage?.body ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [conversationFilter, conversationQuery, conversations]);

  const activeReadStates = useMemo(
    () =>
      (activeConversationId ? readStatesByConversation[activeConversationId] : []) ?? [],
    [activeConversationId, readStatesByConversation],
  );

  const seenByMessageId = useMemo(() => {
    const entries = new Map<string, string[]>();
    for (const state of activeReadStates) {
      if (!state.lastReadMessageId) {
        continue;
      }
      if (state.userId === user?.id) {
        continue;
      }
      const list = entries.get(state.lastReadMessageId) ?? [];
      list.push(state.user.displayName);
      entries.set(state.lastReadMessageId, list);
    }
    return entries;
  }, [activeReadStates, user?.id]);

  const activeTypingUsers = useMemo(() => {
    if (!activeConversationId) {
      return [];
    }

    const typingState = typingByConversation[activeConversationId] ?? {};
    const now = Date.now();
    const nameByUserId = new Map<string, string>();

    for (const state of activeReadStates) {
      nameByUserId.set(state.userId, state.user.displayName);
    }
    for (const message of messages) {
      nameByUserId.set(message.sender.id, message.sender.displayName);
    }
    if (activeConversation?.directUser) {
      nameByUserId.set(
        activeConversation.directUser.id,
        activeConversation.directUser.displayName,
      );
    }

    return Object.entries(typingState)
      .filter(([userId, updatedAt]) => {
        if (userId === user?.id) {
          return false;
        }
        const parsed = Date.parse(updatedAt);
        if (Number.isNaN(parsed)) {
          return false;
        }
        return now - parsed < 12_000;
      })
      .map(([userId]) => nameByUserId.get(userId) ?? "Jemand");
  }, [
    activeConversation?.directUser,
    activeConversationId,
    activeReadStates,
    messages,
    typingByConversation,
    user?.id,
  ]);

  const typingLabel = useMemo(() => {
    if (activeTypingUsers.length === 0) {
      return "";
    }
    if (activeTypingUsers.length === 1) {
      return `${activeTypingUsers[0]} schreibt...`;
    }
    if (activeTypingUsers.length === 2) {
      return `${activeTypingUsers[0]} und ${activeTypingUsers[1]} schreiben...`;
    }
    return `${activeTypingUsers[0]} +${activeTypingUsers.length - 1} schreiben...`;
  }, [activeTypingUsers]);

  const messageAvatarDriveIds = useMemo(() => {
    const ids = new Set<string>();
    for (const message of messages) {
      const driveId = extractDriveAvatarId(message.sender.avatarUrl);
      if (driveId) {
        ids.add(driveId);
      }
    }
    return Array.from(ids);
  }, [messages]);

  const resolvedAvatarByUserId = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const message of messages) {
      const raw = message.sender.avatarUrl?.trim() ?? null;
      if (!raw) {
        map.set(message.sender.id, null);
        continue;
      }
      const driveId = extractDriveAvatarId(raw);
      if (driveId) {
        map.set(message.sender.id, avatarByDriveId[driveId] ?? null);
      } else {
        map.set(message.sender.id, raw);
      }
    }
    return map;
  }, [avatarByDriveId, messages]);

  useEffect(() => {
    avatarObjectUrlsRef.current = avatarByDriveId;
  }, [avatarByDriveId]);

  useEffect(() => {
    return () => {
      for (const url of Object.values(avatarObjectUrlsRef.current)) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  useEffect(() => {
    const accessToken = tokens?.accessToken;
    if (!accessToken || messageAvatarDriveIds.length === 0) {
      return;
    }

    const missingIds = messageAvatarDriveIds.filter(
      (id) => !avatarByDriveId[id] && !avatarLoadingIdsRef.current.has(id),
    );
    if (missingIds.length === 0) {
      return;
    }

    let active = true;
    const controller = new AbortController();
    const created: Record<string, string> = {};

    for (const id of missingIds) {
      avatarLoadingIdsRef.current.add(id);
    }

    const load = async () => {
      await Promise.all(
        missingIds.map(async (id) => {
          try {
            const response = await fetch(buildApiUrl(`/drive/files/${id}/download`), {
              method: "GET",
              headers: authHeaders(accessToken),
              cache: "no-store",
              signal: controller.signal,
            });
            if (!response.ok) {
              return;
            }
            const blob = await response.blob();
            created[id] = URL.createObjectURL(blob);
          } catch {
            // ignore avatar fetch errors
          }
        }),
      );

      if (!active) {
        for (const url of Object.values(created)) {
          URL.revokeObjectURL(url);
        }
        return;
      }

      if (Object.keys(created).length === 0) {
        return;
      }

      setAvatarByDriveId((current) => {
        const next = { ...current };
        for (const [id, url] of Object.entries(created)) {
          if (!next[id]) {
            next[id] = url;
          } else {
            URL.revokeObjectURL(url);
          }
        }
        return next;
      });
    };

    void load().finally(() => {
      for (const id of missingIds) {
        avatarLoadingIdsRef.current.delete(id);
      }
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [avatarByDriveId, messageAvatarDriveIds, tokens?.accessToken]);

  const pickInitialConversation = useCallback(
    (items: ChatConversationSummary[], current: string | null) => {
      if (current && items.some((entry) => entry.id === current)) {
        return current;
      }
      if (customerMode) {
        const customerConversation = items.find((entry) => entry.type === "CUSTOMER");
        return customerConversation?.id ?? items[0]?.id ?? null;
      }
      return items[0]?.id ?? null;
    },
    [customerMode],
  );

  const refreshConversations = useCallback(
    async (options?: ListRefreshOptions) => {
      if (!user) {
        return;
      }
      if (!options?.silent) {
        setLoadingConversations(true);
      }
      try {
        const items = await authorizedRequest<ChatConversationSummary[]>("/chat/conversations?limit=80");
        setConversations(items ?? []);
        setActiveConversationId((current) => pickInitialConversation(items ?? [], current));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Chats konnten nicht geladen werden.");
      } finally {
        if (!options?.silent) {
          setLoadingConversations(false);
        }
      }
    },
    [authorizedRequest, pickInitialConversation, user],
  );

  const scheduleConversationRefresh = useCallback(
    (options?: ListRefreshOptions) => {
      if (typeof window === "undefined") {
        return;
      }
      if (refreshTimerRef.current !== null) {
        return;
      }
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        void refreshConversations(options ?? { silent: true });
      }, 160);
    },
    [refreshConversations],
  );

  const loadMessages = useCallback(
    async (conversationId: string, options?: { silent?: boolean }) => {
      if (!conversationId) {
        setMessages([]);
        setHasMoreMessages(false);
        setNextMessagesBefore(null);
        return;
      }
      if (!options?.silent) {
        setLoadingMessages(true);
      }
      try {
        const response = await authorizedRequest<ChatMessageListResponse>(
          `/chat/conversations/${conversationId}/messages?limit=80`,
        );
        setMessages(response?.items ?? []);
        setHasMoreMessages(Boolean(response?.pagination?.hasMore));
        setNextMessagesBefore(response?.pagination?.nextBefore ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Nachrichten konnten nicht geladen werden.");
      } finally {
        if (!options?.silent) {
          setLoadingMessages(false);
        }
      }
    },
    [authorizedRequest],
  );

  const loadReadStates = useCallback(
    async (conversationId: string) => {
      if (!conversationId) {
        return;
      }
      try {
        const states = await authorizedRequest<ChatReadStateSummary[]>(
          `/chat/conversations/${conversationId}/read-states`,
        );
        setReadStatesByConversation((current) => ({
          ...current,
          [conversationId]: states ?? [],
        }));
      } catch {
        // ignore transient read-state errors
      }
    },
    [authorizedRequest],
  );

  const uploadAttachment = useCallback(
    async (conversationId: string, file: File) => {
      if (!tokens?.accessToken) {
        throw new Error("Keine aktive Session für Upload vorhanden.");
      }
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", file.name);

      const response = await fetch(buildApiUrl(`/chat/conversations/${conversationId}/attachments`), {
        method: "POST",
        headers: authHeaders(tokens.accessToken),
        body: formData,
        cache: "no-store",
      });

      if (!response.ok) {
        let message = "Anhang konnte nicht hochgeladen werden.";
        try {
          const payload = (await response.json()) as { message?: string; error?: string };
          message = payload.message ?? payload.error ?? message;
        } catch {
          // ignore parse errors
        }
        throw new Error(message);
      }

      return (await response.json()) as ChatAttachmentUploadResponse;
    },
    [tokens?.accessToken],
  );

  const markConversationRead = useCallback(
    async (conversationId: string, lastReadMessageId?: string) => {
      const body = lastReadMessageId ? { lastReadMessageId } : {};
      await authorizedRequest(`/chat/conversations/${conversationId}/read`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    [authorizedRequest],
  );

  const emitTyping = useCallback((conversationId: string, isTyping: boolean) => {
    if (!conversationId) {
      return;
    }
    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      return;
    }
    socket.emit("chat:typing.set", {
      conversationId,
      isTyping,
    });
  }, []);

  const stopTyping = useCallback(
    (conversationId?: string | null) => {
      const current = typingStateRef.current;
      const targetConversationId = current.conversationId;
      const shouldStopCurrent =
        current.isTyping &&
        targetConversationId &&
        (!conversationId || conversationId === targetConversationId);
      if (shouldStopCurrent) {
        emitTyping(targetConversationId, false);
      }

      if (typeof window !== "undefined" && typingStopTimerRef.current !== null) {
        window.clearTimeout(typingStopTimerRef.current);
        typingStopTimerRef.current = null;
      }

      typingStateRef.current = {
        conversationId: null,
        isTyping: false,
      };
    },
    [emitTyping],
  );

  const loadOlderMessages = useCallback(async () => {
    if (!activeConversationId || !nextMessagesBefore || loadingMoreMessages) {
      return;
    }

    setLoadingMoreMessages(true);
    try {
      const container = messagesContainerRef.current;
      const previousScrollHeight = container?.scrollHeight ?? null;
      const previousScrollTop = container?.scrollTop ?? null;

      const response = await authorizedRequest<ChatMessageListResponse>(
        `/chat/conversations/${activeConversationId}/messages?limit=80&before=${encodeURIComponent(nextMessagesBefore)}`,
      );

      const olderMessages = response?.items ?? [];
      if (olderMessages.length > 0) {
        suppressAutoScrollRef.current = true;
        setMessages((current) => [...olderMessages, ...current]);
        if (typeof window !== "undefined") {
          window.requestAnimationFrame(() => {
            const node = messagesContainerRef.current;
            if (
              node &&
              previousScrollHeight !== null &&
              previousScrollTop !== null
            ) {
              const delta = node.scrollHeight - previousScrollHeight;
              node.scrollTop = previousScrollTop + delta;
            }
            suppressAutoScrollRef.current = false;
          });
        } else {
          suppressAutoScrollRef.current = false;
        }
      }

      setHasMoreMessages(Boolean(response?.pagination?.hasMore));
      setNextMessagesBefore(response?.pagination?.nextBefore ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ältere Nachrichten konnten nicht geladen werden.");
    } finally {
      setLoadingMoreMessages(false);
    }
  }, [
    activeConversationId,
    authorizedRequest,
    loadingMoreMessages,
    nextMessagesBefore,
  ]);

  const bootstrapData = useCallback(async () => {
    if (!user) {
      return;
    }

    setBootstrapping(true);
    setError(null);
    try {
      if (customerMode) {
        await authorizedRequest<ChatConversationSummary>("/chat/conversations/customer", {
          method: "POST",
          body: JSON.stringify({}),
        });
      } else {
        await authorizedRequest<ChatConversationSummary>("/chat/conversations/team", {
          method: "POST",
        });
      }

      await refreshConversations({ silent: true });

      if (!customerMode) {
        const [employees, customers] = await Promise.all([
          authorizedRequest<Array<{ id: string; email: string; firstName?: string | null; lastName?: string | null; role?: string }>>("/users"),
          authorizedRequest<CustomerListResponse>("/customers?limit=100"),
        ]);

        const nextEmployees = (employees ?? [])
          .filter((entry) => entry.id !== user.id)
          .filter((entry) => entry.role !== "CUSTOMER")
          .map((entry) => ({
            id: entry.id,
            label:
              `${entry.firstName ?? ""} ${entry.lastName ?? ""}`.trim() ||
              entry.email,
          }))
          .sort((a, b) => a.label.localeCompare(b.label, "de-DE"));

        const nextCustomers = (customers?.items ?? [])
          .map((entry) => ({ id: entry.id, label: entry.name }))
          .sort((a, b) => a.label.localeCompare(b.label, "de-DE"));

        setEmployeeOptions(nextEmployees);
        setCustomerOptions(nextCustomers);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chat konnte nicht initialisiert werden.");
    } finally {
      setBootstrapping(false);
    }
  }, [authorizedRequest, customerMode, refreshConversations, user]);

  useEffect(() => {
    if (!canRender || !user) {
      return;
    }
    void bootstrapData();
  }, [bootstrapData, canRender, user]);

  useEffect(() => {
    if (!canRender || !tokens?.accessToken) {
      return;
    }

    const base = resolveSocketBaseUrl();
    const url = base ? `${base}/chat` : "/chat";
    const socket = io(url, {
      path: "/socket.io",
      transports: ["websocket"],
      auth: {
        token: `Bearer ${tokens.accessToken}`,
      },
    });

    socketRef.current = socket;

    const handleConnect = () => {
      setSocketOnline(true);
    };

    const handleDisconnect = () => {
      setSocketOnline(false);
    };

    const handleMessageCreated = (event: ChatMessageCreatedEvent) => {
      scheduleConversationRefresh({ silent: true });
      if (!event?.conversationId) {
        return;
      }
      if (panelOpenRef.current && activeConversationRef.current === event.conversationId) {
        void Promise.all([
          loadMessages(event.conversationId, { silent: true }),
          loadReadStates(event.conversationId),
        ]);
      }

      if (!event.message || event.message.sender.id === user?.id) {
        return;
      }

      const shouldNotify =
        typeof document !== "undefined" &&
        (document.visibilityState === "hidden" ||
          !panelOpenRef.current ||
          activeConversationRef.current !== event.conversationId);

      if (!shouldNotify) {
        return;
      }

      const conversationTitle =
        activeConversationRef.current === event.conversationId
          ? activeConversationTitleRef.current
          : null;
      const preview =
        event.message.body?.trim() ||
        (event.message.attachments.length
          ? `${event.message.attachments.length} Anhang/Anhänge`
          : "Neue Nachricht");

      if (desktopAlertsRef.current) {
        notify({
          title: conversationTitle
            ? `Neue Nachricht in ${conversationTitle}`
            : "Neue Chat-Nachricht",
          description: `${event.message.sender.displayName}: ${preview}`,
          variant: "info",
        });
      }

      if (soundAlertsRef.current) {
        playNotificationBeep();
      }
    };

    const handleReadUpdated = (event: ChatReadUpdatedEvent) => {
      scheduleConversationRefresh({ silent: true });
      const conversationId = event?.conversationId;
      const state = event?.state;
      if (!conversationId) {
        return;
      }
      if (state?.userId) {
        setReadStatesByConversation((current) => {
          const existing = current[conversationId] ?? [];
          const nextUpdatedAt = state.updatedAt ?? new Date().toISOString();
          const next = existing.filter((entry) => entry.userId !== state.userId);
          const previous = existing.find((entry) => entry.userId === state.userId);
          if (previous) {
            next.push({
              ...previous,
              lastReadMessageId: state.lastReadMessageId,
              lastReadAt: state.lastReadAt,
              updatedAt: nextUpdatedAt,
            });
          }
          return {
            ...current,
            [conversationId]: next.sort((a, b) =>
              b.updatedAt.localeCompare(a.updatedAt),
            ),
          };
        });
      }
      if (panelOpenRef.current && activeConversationRef.current === conversationId) {
        void Promise.all([
          loadMessages(conversationId, { silent: true }),
          loadReadStates(conversationId),
        ]);
      }
    };

    const handleConversationChanged = (event: ChatConversationChangedEvent) => {
      scheduleConversationRefresh({ silent: true });
      if (!event?.conversationId) {
        return;
      }
      if (panelOpenRef.current && activeConversationRef.current === event.conversationId) {
        void Promise.all([
          loadMessages(event.conversationId, { silent: true }),
          loadReadStates(event.conversationId),
        ]);
      }
    };

    const handleTypingUpdated = (event: ChatTypingUpdatedEvent) => {
      const conversationId = event?.conversationId;
      const typingUserId = event?.userId;
      if (!conversationId || !typingUserId || typingUserId === user?.id) {
        return;
      }

      setTypingByConversation((current) => {
        const existing = {
          ...(current[conversationId] ?? {}),
        };

        if (event.isTyping) {
          existing[typingUserId] = event.updatedAt || new Date().toISOString();
          return {
            ...current,
            [conversationId]: existing,
          };
        }

        if (!(typingUserId in existing)) {
          return current;
        }

        delete existing[typingUserId];
        if (Object.keys(existing).length === 0) {
          const next = { ...current };
          delete next[conversationId];
          return next;
        }

        return {
          ...current,
          [conversationId]: existing,
        };
      });
    };

    const handleSocketError = (payload: { message?: string }) => {
      if (payload?.message) {
        setError(payload.message);
      }
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("chat:message.created", handleMessageCreated);
    socket.on("chat:read.updated", handleReadUpdated);
    socket.on("chat:conversation.changed", handleConversationChanged);
    socket.on("chat:typing.updated", handleTypingUpdated);
    socket.on("chat:error", handleSocketError);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("chat:message.created", handleMessageCreated);
      socket.off("chat:read.updated", handleReadUpdated);
      socket.off("chat:conversation.changed", handleConversationChanged);
      socket.off("chat:typing.updated", handleTypingUpdated);
      socket.off("chat:error", handleSocketError);
      socket.disconnect();
      socketRef.current = null;
      setSocketOnline(false);
    };
  }, [
    canRender,
    loadMessages,
    loadReadStates,
    notify,
    scheduleConversationRefresh,
    tokens?.accessToken,
    user?.id,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const timer = window.setInterval(() => {
      const cutoff = Date.now() - 12_000;
      setTypingByConversation((current) => {
        let changed = false;
        const next: Record<string, Record<string, string>> = {};

        for (const [conversationId, entries] of Object.entries(current)) {
          const filtered: Record<string, string> = {};
          for (const [typingUserId, updatedAt] of Object.entries(entries)) {
            const parsed = Date.parse(updatedAt);
            if (!Number.isNaN(parsed) && parsed >= cutoff) {
              filtered[typingUserId] = updatedAt;
            } else {
              changed = true;
            }
          }
          if (Object.keys(filtered).length > 0) {
            next[conversationId] = filtered;
          } else if (Object.keys(entries).length > 0) {
            changed = true;
          }
        }

        return changed ? next : current;
      });
    }, 5_000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!isOpen || !socketOnline || !activeConversationId) {
      stopTyping();
      return;
    }

    const trimmed = draft.trim();
    if (!trimmed) {
      stopTyping(activeConversationId);
      return;
    }

    const current = typingStateRef.current;
    if (
      current.isTyping &&
      current.conversationId &&
      current.conversationId !== activeConversationId
    ) {
      emitTyping(current.conversationId, false);
      typingStateRef.current = {
        conversationId: null,
        isTyping: false,
      };
    }

    if (
      !typingStateRef.current.isTyping ||
      typingStateRef.current.conversationId !== activeConversationId
    ) {
      emitTyping(activeConversationId, true);
      typingStateRef.current = {
        conversationId: activeConversationId,
        isTyping: true,
      };
    }

    if (typeof window !== "undefined") {
      if (typingStopTimerRef.current !== null) {
        window.clearTimeout(typingStopTimerRef.current);
      }
      typingStopTimerRef.current = window.setTimeout(() => {
        const state = typingStateRef.current;
        if (state.isTyping && state.conversationId === activeConversationId) {
          emitTyping(activeConversationId, false);
          typingStateRef.current = {
            conversationId: null,
            isTyping: false,
          };
        }
        typingStopTimerRef.current = null;
      }, 1_600);
    }
  }, [
    activeConversationId,
    draft,
    emitTyping,
    isOpen,
    socketOnline,
    stopTyping,
  ]);

  useEffect(() => {
    return () => {
      stopTyping();
    };
  }, [stopTyping]);

  useEffect(() => {
    if (!socketOnline || !activeConversationId || !isOpen) {
      return;
    }
    socketRef.current?.emit("chat:conversation.join", {
      conversationId: activeConversationId,
    });

    return () => {
      stopTyping(activeConversationId);
      socketRef.current?.emit("chat:conversation.leave", {
        conversationId: activeConversationId,
      });
    };
  }, [activeConversationId, isOpen, socketOnline, stopTyping]);

  useEffect(() => {
    if (!isOpen || !activeConversationId) {
      return;
    }
    void Promise.all([
      loadMessages(activeConversationId),
      loadReadStates(activeConversationId),
    ]);
  }, [activeConversationId, isOpen, loadMessages, loadReadStates]);

  useEffect(() => {
    if (!isOpen || suppressAutoScrollRef.current) {
      return;
    }
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [isOpen, messages, activeConversationId]);

  useEffect(() => {
    if (!isOpen || !activeConversationId || messages.length === 0) {
      return;
    }
    const latest = messages[messages.length - 1];
    if (!latest?.id) {
      return;
    }

    const marker = `${activeConversationId}:${latest.id}`;
    if (lastMarkedMessageRef.current === marker) {
      return;
    }

    lastMarkedMessageRef.current = marker;
    void markConversationRead(activeConversationId, latest.id)
      .then(() => {
        void loadReadStates(activeConversationId);
        scheduleConversationRefresh({ silent: true });
      })
      .catch(() => undefined);
  }, [
    activeConversationId,
    isOpen,
    loadReadStates,
    markConversationRead,
    messages,
    scheduleConversationRefresh,
  ]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }
      if (typeof window !== "undefined" && typingStopTimerRef.current !== null) {
        window.clearTimeout(typingStopTimerRef.current);
      }
    };
  }, []);

  const handleTeamConversation = useCallback(async () => {
    try {
      setError(null);
      const conversation = await authorizedRequest<ChatConversationSummary>("/chat/conversations/team", {
        method: "POST",
      });
      await refreshConversations({ silent: true });
      setActiveConversationId(conversation.id);
      setIsOpen(true);
      setIsListOpenMobile(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Team-Chat konnte nicht geöffnet werden.");
    }
  }, [authorizedRequest, refreshConversations]);

  const handleCreateDirectConversation = useCallback(async () => {
    if (!directUserId) {
      return;
    }
    try {
      setError(null);
      const conversation = await authorizedRequest<ChatConversationSummary>("/chat/conversations/direct", {
        method: "POST",
        body: JSON.stringify({ userId: directUserId }),
      });
      await refreshConversations({ silent: true });
      setActiveConversationId(conversation.id);
      setDirectUserId("");
      setShowDirectForm(false);
      setIsOpen(true);
      setIsListOpenMobile(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Direktchat konnte nicht erstellt werden.");
    }
  }, [authorizedRequest, directUserId, refreshConversations]);

  const handleCreateCustomerConversation = useCallback(async () => {
    if (!customerId) {
      return;
    }
    try {
      setError(null);
      const conversation = await authorizedRequest<ChatConversationSummary>("/chat/conversations/customer", {
        method: "POST",
        body: JSON.stringify({ customerId }),
      });
      await refreshConversations({ silent: true });
      setActiveConversationId(conversation.id);
      setCustomerId("");
      setShowCustomerForm(false);
      setIsOpen(true);
      setIsListOpenMobile(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kundenchat konnte nicht erstellt werden.");
    }
  }, [authorizedRequest, customerId, refreshConversations]);

  const handleFilesSelected = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    if (!selected.length) {
      return;
    }
    setPendingFiles((current) => [...current, ...selected].slice(0, 10));
    event.target.value = "";
  }, []);

  const removePendingFile = useCallback((index: number) => {
    setPendingFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
  }, []);

  const handleSendMessage = useCallback(async () => {
    if (!activeConversationId || sending) {
      return;
    }

    const body = draft.trim();
    if (!body && pendingFiles.length === 0) {
      return;
    }

    setSending(true);
    setError(null);

    try {
      stopTyping(activeConversationId);
      const attachmentFileIds = pendingFiles.length
        ? await Promise.all(
            pendingFiles.map(async (file) => {
              const uploaded = await uploadAttachment(activeConversationId, file);
              return uploaded.fileId;
            }),
          )
        : [];

      await authorizedRequest(`/chat/conversations/${activeConversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          body: body || undefined,
          attachmentFileIds,
        }),
      });

      setDraft("");
      setPendingFiles([]);
      await Promise.all([
        loadMessages(activeConversationId, { silent: true }),
        loadReadStates(activeConversationId),
        refreshConversations({ silent: true }),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nachricht konnte nicht gesendet werden.");
    } finally {
      setSending(false);
    }
  }, [
    activeConversationId,
    authorizedRequest,
    draft,
    loadMessages,
    loadReadStates,
    pendingFiles,
    refreshConversations,
    sending,
    stopTyping,
    uploadAttachment,
  ]);

  const handleDownloadAttachment = useCallback(
    async (attachment: ChatAttachment) => {
      if (!tokens?.accessToken) {
        setError("Download ist ohne aktive Session nicht möglich.");
        return;
      }

      try {
        const response = await fetch(buildApiUrl(`/chat/attachments/${attachment.id}/download`), {
          method: "GET",
          headers: authHeaders(tokens.accessToken),
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Datei konnte nicht geladen werden.");
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = attachment.name;
        link.click();
        URL.revokeObjectURL(objectUrl);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Download fehlgeschlagen.");
      }
    },
    [tokens?.accessToken],
  );

  if (!canRender) {
    return null;
  }

  const panelTitle = customerMode ? "Kundenchat" : "Team Chat";

  return (
    <>
      <div className="fixed bottom-6 right-6 z-[240] flex flex-col items-end gap-3">
        {!isOpen ? (
          <Button
            size="icon"
            className="relative h-14 w-14 rounded-full bg-sky-500 text-slate-950 shadow-[0_12px_40px_rgba(14,165,233,0.45)] hover:bg-sky-400"
            onClick={() => setIsOpen(true)}
            aria-label="Chat öffnen"
            title="Chat öffnen"
          >
            <MessageCircleMore className="h-6 w-6" />
            {totalUnread > 0 ? (
              <span className="absolute -right-1 -top-1 min-w-[22px] rounded-full bg-rose-500 px-1.5 py-0.5 text-[11px] font-bold text-white">
                {totalUnread > 99 ? "99+" : totalUnread}
              </span>
            ) : null}
          </Button>
        ) : null}
      </div>

      {isOpen ? (
        <div className="fixed bottom-24 right-3 z-[240] w-[calc(100vw-1.5rem)] max-w-[960px] overflow-hidden rounded-3xl border border-white/10 bg-slate-950/95 shadow-2xl backdrop-blur-xl sm:right-6 sm:w-[calc(100vw-3rem)]">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Arcto Connect</p>
              <h3 className="text-sm font-semibold text-white">{panelTitle}</h3>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className={clsx(
                  "h-8 w-8 rounded-full border",
                  desktopAlertsEnabled
                    ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                    : "border-white/10 text-slate-300",
                )}
                onClick={() => setDesktopAlertsEnabled((current) => !current)}
                aria-label="Desktop-Benachrichtigungen umschalten"
                title="Desktop-Benachrichtigungen"
              >
                {desktopAlertsEnabled ? (
                  <Bell className="h-4 w-4" />
                ) : (
                  <BellOff className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={clsx(
                  "h-8 w-8 rounded-full border",
                  soundAlertsEnabled
                    ? "border-sky-400/30 bg-sky-500/10 text-sky-200"
                    : "border-white/10 text-slate-300",
                )}
                onClick={() => setSoundAlertsEnabled((current) => !current)}
                aria-label="Sound-Benachrichtigungen umschalten"
                title="Ton-Benachrichtigungen"
              >
                {soundAlertsEnabled ? (
                  <Volume2 className="h-4 w-4" />
                ) : (
                  <VolumeX className="h-4 w-4" />
                )}
              </Button>
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-300">
                <Circle className={clsx("h-2.5 w-2.5", socketOnline ? "fill-emerald-400 text-emerald-400" : "fill-amber-400 text-amber-400")} />
                {socketOnline ? "Live" : "Sync"}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full"
                onClick={() => {
                  setIsOpen(false);
                  setIsListOpenMobile(false);
                }}
                aria-label="Chat schließen"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex h-[min(74vh,700px)] min-h-[500px]">
            {!customerMode ? (
              <aside
                className={clsx(
                  "w-[280px] flex-shrink-0 border-r border-white/10 bg-slate-900/70",
                  isListOpenMobile ? "block" : "hidden md:block",
                )}
              >
                <div className="space-y-3 border-b border-white/10 p-3">
                  <Button
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => void handleTeamConversation()}
                  >
                    <Users className="h-4 w-4" />
                    Team-Chat öffnen
                  </Button>

                  <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-2">
                    <Input
                      ref={searchInputRef}
                      value={conversationQuery}
                      onChange={(event) => setConversationQuery(event.target.value)}
                      placeholder="Chats durchsuchen..."
                      className="h-9 rounded-xl border-white/10 bg-slate-900 text-xs"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          { key: "ALL", label: "Alle" },
                          { key: "TEAM", label: "Team" },
                          { key: "DIRECT", label: "Direkt" },
                          { key: "CUSTOMER", label: "Kunden" },
                        ] as Array<{ key: ChatConversationFilter; label: string }>
                      ).map((entry) => (
                        <button
                          key={entry.key}
                          type="button"
                          onClick={() => setConversationFilter(entry.key)}
                          className={clsx(
                            "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
                            conversationFilter === entry.key
                              ? "border-sky-300/40 bg-sky-500/15 text-sky-100"
                              : "border-white/10 text-slate-300 hover:bg-white/10 hover:text-white",
                          )}
                        >
                          {entry.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-500">
                      Shortcut: <span className="font-mono">Ctrl+Shift+F</span> Suche
                    </p>
                  </div>

                  <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-2">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between text-left text-xs font-semibold text-slate-200"
                      onClick={() => {
                        setShowDirectForm((current) => !current);
                        setShowCustomerForm(false);
                      }}
                    >
                      Direktchat
                      <Plus className="h-4 w-4" />
                    </button>
                    {showDirectForm ? (
                      <div className="space-y-2">
                        <select
                          value={directUserId}
                          onChange={(event) => setDirectUserId(event.target.value)}
                          className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs text-white focus:border-sky-400 focus:outline-none"
                        >
                          <option value="">Mitarbeiter wählen</option>
                          {employeeOptions.map((entry) => (
                            <option key={entry.id} value={entry.id}>
                              {entry.label}
                            </option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          className="w-full"
                          disabled={!directUserId}
                          onClick={() => void handleCreateDirectConversation()}
                        >
                          Chat starten
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-2">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between text-left text-xs font-semibold text-slate-200"
                      onClick={() => {
                        setShowCustomerForm((current) => !current);
                        setShowDirectForm(false);
                      }}
                    >
                      Kundenchat
                      <Plus className="h-4 w-4" />
                    </button>
                    {showCustomerForm ? (
                      <div className="space-y-2">
                        <select
                          value={customerId}
                          onChange={(event) => setCustomerId(event.target.value)}
                          className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs text-white focus:border-sky-400 focus:outline-none"
                        >
                          <option value="">Kundenkonto wählen</option>
                          {customerOptions.map((entry) => (
                            <option key={entry.id} value={entry.id}>
                              {entry.label}
                            </option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          className="w-full"
                          disabled={!customerId}
                          onClick={() => void handleCreateCustomerConversation()}
                        >
                          Chat starten
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="h-[calc(100%-210px)] overflow-y-auto p-2">
                  {loadingConversations || bootstrapping ? (
                    <p className="flex items-center gap-2 px-2 py-4 text-xs text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Lade Konversationen...
                    </p>
                  ) : null}

                  {!loadingConversations && conversations.length === 0 ? (
                    <p className="px-2 py-6 text-xs text-slate-400">Noch keine Konversationen vorhanden.</p>
                  ) : null}

                  {!loadingConversations &&
                  conversations.length > 0 &&
                  visibleConversations.length === 0 ? (
                    <p className="px-2 py-6 text-xs text-slate-400">
                      Kein Treffer für die aktuelle Suche/Filter.
                    </p>
                  ) : null}

                  <div className="space-y-1">
                    {visibleConversations.map((conversation) => {
                      const Icon = getConversationIcon(conversation);
                      const isActive = conversation.id === activeConversationId;

                      return (
                        <button
                          key={conversation.id}
                          type="button"
                          onClick={() => {
                            setActiveConversationId(conversation.id);
                            setIsListOpenMobile(false);
                            setError(null);
                          }}
                          className={clsx(
                            "w-full rounded-2xl border px-3 py-2 text-left transition",
                            isActive
                              ? "border-sky-300/30 bg-sky-400/10"
                              : "border-white/10 bg-white/5 hover:bg-white/10",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <Icon className="h-4 w-4 text-slate-300" />
                              <p className="truncate text-sm font-medium text-white">{conversation.title}</p>
                            </div>
                            {conversation.unreadCount > 0 ? (
                              <span className="rounded-full bg-rose-500/85 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                                {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 truncate text-xs text-slate-400">
                            {conversation.lastMessage?.body?.trim() ||
                              (conversation.lastMessage?.attachments?.length
                                ? `${conversation.lastMessage.attachments.length} Anhang/Anhänge`
                                : "Noch keine Nachricht")}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {formatDateTime(conversation.lastMessageAt || conversation.updatedAt)}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </aside>
            ) : null}

            <div
              className={clsx(
                "flex min-w-0 flex-1 flex-col",
                !customerMode && isListOpenMobile ? "hidden md:flex" : "flex",
              )}
            >
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  {!customerMode ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full md:hidden"
                      onClick={() => setIsListOpenMobile(true)}
                      aria-label="Konversationsliste öffnen"
                    >
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                  ) : null}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">
                      {activeConversation?.title || "Keine Konversation ausgewählt"}
                    </p>
                    <p className="text-xs text-slate-400">
                      {activeConversation
                        ? activeConversation.type === "DIRECT"
                          ? "Direktchat"
                          : activeConversation.type === "TEAM"
                            ? "Team-Channel"
                            : "Kundenkanal"
                        : "Bitte Konversation auswählen"}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => void refreshConversations()}
                >
                  Aktualisieren
                </Button>
              </div>

              <div
                ref={messagesContainerRef}
                className="flex-1 overflow-y-auto bg-[linear-gradient(180deg,rgba(2,6,23,0.75)_0%,rgba(2,6,23,0.98)_100%)] px-4 py-4"
              >
                {loadingMessages && activeConversationId ? (
                  <p className="flex items-center gap-2 text-xs text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Lade Nachrichten...
                  </p>
                ) : null}

                {activeConversationId && hasMoreMessages ? (
                  <div className="mb-3 flex justify-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-full border border-white/15 bg-white/5 px-3 text-[11px] text-slate-100 hover:bg-white/10"
                      onClick={() => void loadOlderMessages()}
                      disabled={loadingMoreMessages}
                    >
                      {loadingMoreMessages ? (
                        <>
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          Lädt...
                        </>
                      ) : (
                        "Ältere Nachrichten laden"
                      )}
                    </Button>
                  </div>
                ) : null}

                {!activeConversationId && !customerMode ? (
                  <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-slate-300">
                    Konversation wählen oder oben einen neuen Chat starten.
                  </div>
                ) : null}

                {activeConversationId && messages.length === 0 && !loadingMessages ? (
                  <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-slate-300">
                    Noch keine Nachricht. Starte die Unterhaltung unten.
                  </div>
                ) : null}

                <div className="space-y-3">
                  {messages.map((message) => {
                    const isMine = message.sender.id === user?.id;
                    const senderAvatarUrl = resolvedAvatarByUserId.get(message.sender.id) ?? null;
                    const senderInitials = getInitials(message.sender.displayName);
                    const seenBy = seenByMessageId.get(message.id) ?? [];
                    const seenLabel =
                      seenBy.length > 3
                        ? `${seenBy.slice(0, 3).join(", ")} +${seenBy.length - 3}`
                        : seenBy.join(", ");
                    return (
                      <div
                        key={message.id}
                        className={clsx(
                          "flex items-end gap-2",
                          isMine ? "justify-end" : "justify-start",
                        )}
                      >
                        {!isMine ? (
                          <Avatar className="h-8 w-8 border border-white/15 bg-slate-900/90">
                            {senderAvatarUrl ? (
                              <AvatarImage src={senderAvatarUrl} alt={message.sender.displayName} />
                            ) : null}
                            <AvatarFallback className="bg-slate-800 text-[10px] font-semibold text-slate-100">
                              {senderInitials}
                            </AvatarFallback>
                          </Avatar>
                        ) : null}
                        <div
                          className={clsx(
                            "max-w-[86%] rounded-2xl border px-3 py-2",
                            isMine
                              ? "border-sky-300/30 bg-sky-500/15"
                              : "border-white/10 bg-white/5",
                          )}
                        >
                          <p className="mb-1 text-[11px] font-medium text-slate-300">
                            {isMine ? "Du" : message.sender.displayName} · {formatRelativeTime(message.createdAt)}
                          </p>
                          {message.body?.trim() ? (
                            <p className="whitespace-pre-wrap break-words text-sm text-white">{message.body}</p>
                          ) : null}

                          {message.attachments.length > 0 ? (
                            <div className="mt-2 space-y-1">
                              {message.attachments.map((attachment) => (
                                <button
                                  key={attachment.id}
                                  type="button"
                                  onClick={() => void handleDownloadAttachment(attachment)}
                                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 px-2.5 py-1.5 text-left text-xs text-slate-200 hover:bg-black/40"
                                >
                                  <span className="flex min-w-0 items-center gap-2">
                                    <Paperclip className="h-3.5 w-3.5 shrink-0" />
                                    <span className="truncate">{attachment.name}</span>
                                  </span>
                                  <span className="inline-flex items-center gap-1 text-slate-300">
                                    {formatBytes(attachment.size)}
                                    <Download className="h-3.5 w-3.5" />
                                  </span>
                                </button>
                              ))}
                            </div>
                          ) : null}

                          {isMine && seenBy.length > 0 ? (
                            <p className="mt-2 text-[10px] text-emerald-300/90">
                              Gesehen von {seenLabel}
                            </p>
                          ) : null}
                        </div>
                        {isMine ? (
                          <Avatar className="h-8 w-8 border border-sky-300/30 bg-sky-500/10">
                            {senderAvatarUrl ? (
                              <AvatarImage src={senderAvatarUrl} alt={message.sender.displayName} />
                            ) : null}
                            <AvatarFallback className="bg-sky-900/60 text-[10px] font-semibold text-sky-100">
                              {senderInitials}
                            </AvatarFallback>
                          </Avatar>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <div ref={endRef} />
              </div>

              <div className="border-t border-white/10 p-3">
                {pendingFiles.length > 0 ? (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {pendingFiles.map((file, index) => (
                      <div
                        key={`${file.name}-${file.size}-${index}`}
                        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200"
                      >
                        <Paperclip className="h-3 w-3" />
                        <span className="max-w-[180px] truncate">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => removePendingFile(index)}
                          className="rounded-full p-0.5 text-slate-300 hover:bg-white/10 hover:text-white"
                          aria-label="Datei entfernen"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="flex items-end gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    multiple
                    onChange={handleFilesSelected}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 rounded-2xl"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!activeConversationId || sending}
                    aria-label="Datei anhängen"
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>

                  <Textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    rows={2}
                    placeholder="Nachricht schreiben..."
                    className="min-h-[44px] max-h-32"
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void handleSendMessage();
                      }
                    }}
                    disabled={!activeConversationId || sending}
                  />

                  <Button
                    size="icon"
                    className="h-10 w-10 rounded-2xl"
                    onClick={() => void handleSendMessage()}
                    disabled={(!draft.trim() && pendingFiles.length === 0) || !activeConversationId || sending}
                    aria-label="Nachricht senden"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>

                {activeConversationId && typingLabel ? (
                  <p className="mt-2 text-xs text-sky-200/85">{typingLabel}</p>
                ) : null}

                {error ? (
                  <p className="mt-2 text-xs text-rose-300">{error}</p>
                ) : (
                  <p className="mt-2 text-[11px] text-slate-500">
                    Shift + Enter Zeilenumbruch · Ctrl+Shift+C öffnet/schließt Chat · Anhänge 90 Tage.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
