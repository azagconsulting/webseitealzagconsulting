import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, MessageSquare, Paperclip, ArrowLeft, Reply, Folder, Trash2, UserPlus } from "lucide-react";
import { clsx } from "clsx";
import type { CustomerMessage } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { formatTimestamp, detectUrgency, formatAttachmentSize, getCategoryMeta } from "./page"; // Assuming export from page.tsx

interface MessageViewProps {
  messages: CustomerMessage[];
  loading: boolean;
  error: string | null;
  highlightMessageId?: string | null;
  onBack: () => void;
  onReply: (message: CustomerMessage) => void;
  onMoveToFolder?: (message: CustomerMessage, folder: string) => void;
  onMoveToTrash?: (message: CustomerMessage) => void;
  onDeletePermanently?: (message: CustomerMessage) => void;
  onExtractContact?: (message: CustomerMessage) => void | Promise<void>;
  extractingMessageId?: string | null;
  folders: string[];
  title: string;
  description: string;
}

export function MessageView({
  messages,
  loading,
  error,
  highlightMessageId,
  onBack,
  onReply,
  onMoveToFolder,
  onMoveToTrash,
  onDeletePermanently,
  onExtractContact,
  extractingMessageId,
  folders,
  title,
  description,
}: MessageViewProps) {
  const [openFolderMenuFor, setOpenFolderMenuFor] = useState<string | null>(null);
  const [confirmDeleteFor, setConfirmDeleteFor] = useState<string | null>(null);
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);
  const lastHighlightIdRef = useRef<string | null>(null);
  const lastScrollIdRef = useRef<string | null>(null);
  const extractionCandidate = onExtractContact
    ? messages.find((message) => message.direction === "INBOUND") ?? messages[0]
    : null;
  const isHeaderExtracting = Boolean(extractionCandidate && extractingMessageId === extractionCandidate.id);

  useEffect(() => {
    if (!highlightMessageId) {
      setActiveHighlightId(null);
      lastHighlightIdRef.current = null;
      lastScrollIdRef.current = null;
      return;
    }
    if (lastHighlightIdRef.current === highlightMessageId) {
      return;
    }
    if (!messages.some((message) => message.id === highlightMessageId)) {
      return;
    }
    lastHighlightIdRef.current = highlightMessageId;
    setActiveHighlightId(highlightMessageId);
    const timeout = window.setTimeout(() => {
      setActiveHighlightId((current) => (current === highlightMessageId ? null : current));
    }, 1600);
    return () => window.clearTimeout(timeout);
  }, [highlightMessageId, messages]);

  useEffect(() => {
    if (!highlightMessageId) return;
    if (lastScrollIdRef.current === highlightMessageId) return;
    const target = document.getElementById(`message-${highlightMessageId}`);
    if (!target) return;
    lastScrollIdRef.current = highlightMessageId;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [highlightMessageId, messages]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden rounded-3xl border bg-[var(--panel-bg)] p-4 border-[color:var(--panel-border)] shadow-[var(--panel-shadow)]">
      <div className="flex items-center justify-between border-b border-[color:var(--panel-border)] pb-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
            <p className="text-sm text-[var(--text-secondary)]">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onExtractContact && (
            <Button
              variant="outline"
              onClick={() => {
                if (!extractionCandidate) return;
                void onExtractContact(extractionCandidate);
              }}
              disabled={!extractionCandidate || isHeaderExtracting}
            >
              {isHeaderExtracting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="mr-2 h-4 w-4" />
              )}
              Kunde hinzufügen
            </Button>
          )}
          <Button
            onClick={() => {
              const firstMessage = messages[0];
              if (!firstMessage) return;
              onReply(firstMessage);
            }}
            disabled={!messages.length}
          >
            <Reply className="mr-2 h-4 w-4" />
            Antworten
          </Button>
        </div>
      </div>

      {loading && (
        <div className="flex h-full items-center justify-center">
          <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Verlauf wird geladen...
          </p>
        </div>
      )}

      {error && !loading && (
        <div className="flex h-full items-center justify-center">
          <p className="flex items-center gap-2 text-sm text-rose-300">
            <AlertTriangle className="h-4 w-4" /> {error}
          </p>
        </div>
      )}

      {!loading && !error && messages.length === 0 && (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-slate-400">Keine Nachrichten in diesem Verlauf.</p>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-2">
        {messages.map((message) => {
          const isOutbound = message.direction === "OUTBOUND";
          const isExtractingContact = extractingMessageId === message.id;
          const senderName = message.contact?.name?.trim();
          const senderEmail = message.fromEmail?.trim() || message.contact?.email?.trim();
          const senderLabel = senderName
            ? `${senderName}${senderEmail ? ` · ${senderEmail}` : ""}`
            : senderEmail ?? "Kontakt";
          const recipientLabel = message.toEmail ?? message.contact?.name ?? "Kontakt";
          const metaLine = isOutbound ? `Gesendet an ${recipientLabel}` : `Empfangen von ${senderLabel}`;

          const urgency = detectUrgency(message);
          const categoryMeta = getCategoryMeta(message.category);
          const date = formatTimestamp(message.sentAt ?? message.receivedAt ?? message.createdAt);

          const pillBase =
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]";

          return (
            <div
              key={message.id}
              id={`message-${message.id}`}
              className={clsx(
                "flex w-full gap-3",
                isOutbound ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={clsx(
                  "max-w-2xl flex-1 rounded-3xl border px-5 py-4 text-sm shadow-[0_25px_80px_-35px_rgba(0,0,0,0.7)] transition",
                  isOutbound
                    ? "border-sky-400/30 bg-gradient-to-br from-sky-500/20 via-indigo-500/15 to-slate-900/60 text-[var(--text-primary)]"
                    : "border-white/10 bg-gradient-to-br from-slate-900/70 via-slate-900/40 to-slate-800/60 text-[var(--text-primary)]",
                  activeHighlightId === message.id &&
                    "relative z-30 border-r-2 border-r-amber-400/80",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] uppercase tracking-[0.24em] text-[color:var(--text-secondary)]">
                  <div className="flex items-center gap-2">
                    <span
                      className={clsx(
                        pillBase,
                        isOutbound
                          ? "border border-white/20 bg-white/10 text-white"
                          : "border border-white/10 bg-white/5 text-white",
                      )}
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      {isOutbound ? "Outbound" : "Empfangen"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-300">{date}</div>
                </div>
                {(message.subject || categoryMeta || urgency) && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-white">{message.subject || "Ohne Betreff"}</p>
                    {categoryMeta && (
                      <span className={clsx("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", categoryMeta.className)}>
                        {categoryMeta.label}
                      </span>
                    )}
                    {urgency && (
                      <span className="rounded-full bg-amber-500/25 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-100">
                        {urgency}
                      </span>
                    )}
                  </div>
                )}
                {message.summary && (
                  <p className="mt-1 text-xs text-slate-200 opacity-90">{message.summary}</p>
                )}
                <p className="mt-3 whitespace-pre-line text-sm text-slate-100 leading-relaxed">{message.body}</p>
                {message.attachments?.length ? (
                  <div className="mt-3 space-y-2">
                    {message.attachments.map((attachment, index) => {
                       const href = attachment.data ? `data:${attachment.type ?? "application/octet-stream"};base64,${attachment.data}` : undefined;
                       const sizeLabel = formatAttachmentSize(attachment.size);
                       return (
                         <a
                           key={`${message.id}-att-${index}`}
                           href={href}
                           download={attachment.name || undefined}
                           target="_blank"
                           rel="noreferrer"
                           className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white transition hover:border-sky-400/60 hover:text-white"
                         >
                           <Paperclip className="h-4 w-4" />
                           <span className="truncate">{attachment.name || "Anhang"}</span>
                           {sizeLabel && <span className="text-[11px] text-slate-300">{sizeLabel}</span>}
                           {!href && <span className="text-[11px] text-amber-200">Keine Datei verfügbar</span>}
                         </a>
                       );
                    })}
                  </div>
                ) : null}
                <p className="mt-3 text-xs text-slate-400">{metaLine}</p>
              </div>
              {!isOutbound && (
                <div className="flex w-10 flex-col items-center gap-3 pt-1">
                  <button
                    type="button"
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10"
                    onClick={() => onReply(message)}
                    aria-label="Antworten"
                  >
                    <Reply className="h-4 w-4" />
                  </button>
                  {onMoveToFolder && (
                    <div className="relative">
                      <button
                        type="button"
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10"
                        onClick={() =>
                          setOpenFolderMenuFor((prev) => (prev === message.id ? null : message.id))
                        }
                        aria-label="In Ordner verschieben"
                      >
                        <Folder className="h-4 w-4" />
                      </button>
                      {openFolderMenuFor === message.id && (
                        <div className="absolute right-12 top-0 z-10 mt-0 w-44 rounded-xl border border-white/10 bg-slate-900/95 p-2 text-[12px] shadow-xl">
                          {folders.length === 0 && (
                            <p className="px-1 py-1 text-slate-400">Kein Ordner vorhanden.</p>
                          )}
                          {folders.map((folder) => (
                            <button
                              key={folder}
                              type="button"
                              onClick={() => {
                                onMoveToFolder(message, folder);
                                setOpenFolderMenuFor(null);
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-slate-200 hover:bg-white/10"
                            >
                              <Folder className="h-3.5 w-3.5" />
                              <span className="truncate">{folder}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {onDeletePermanently && (
                    <div className="relative">
                      <button
                        type="button"
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-rose-400/30 bg-rose-500/10 text-rose-100 transition hover:bg-rose-500/20 hover:border-rose-400/50"
                        onClick={() =>
                          setConfirmDeleteFor((prev) => (prev === message.id ? null : message.id))
                        }
                        aria-label="Endgültig löschen"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      {confirmDeleteFor === message.id && (
                        <div className="absolute right-12 top-0 z-10 w-56 rounded-xl border border-rose-400/30 bg-slate-950/95 p-3 text-[12px] text-rose-100 shadow-xl">
                          <p className="font-semibold text-rose-100">Endgültig löschen?</p>
                          <p className="mt-1 text-rose-100/80">
                            Diese Aktion kann nicht rückgängig gemacht werden.
                          </p>
                          <div className="mt-3 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteFor(null)}
                              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-200 hover:bg-white/10"
                            >
                              Abbrechen
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmDeleteFor(null);
                                onDeletePermanently(message);
                              }}
                              className="rounded-full border border-rose-400/40 bg-rose-500/20 px-2.5 py-1 text-[11px] font-semibold text-rose-100 hover:bg-rose-500/30"
                            >
                              Löschen
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {onMoveToTrash && (
                    <button
                      type="button"
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 transition hover:bg-rose-500/20 hover:border-rose-400/40"
                      onClick={() => onMoveToTrash(message)}
                      aria-label="In Papierkorb verschieben"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                  {onExtractContact && (
                    <button
                      type="button"
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 transition hover:bg-emerald-500/15 hover:border-emerald-400/40 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => onExtractContact && void onExtractContact(message)}
                      disabled={isExtractingContact}
                      aria-label={isExtractingContact ? "Kontakt wird analysiert" : "Kontakt aus E-Mail vorschlagen"}
                    >
                      {isExtractingContact ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <UserPlus className="h-4 w-4" />
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
