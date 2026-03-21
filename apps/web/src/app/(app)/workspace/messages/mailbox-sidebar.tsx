"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { Inbox, Send, User, ShieldAlert, Folder, FolderPlus, ArrowUp, ArrowDown, Trash2, Edit, Settings, PhoneCall } from "lucide-react";

import { Input } from "@/components/ui/input";

export type Mailbox = "inbox" | "contact-requests" | "sent" | "spam" | "customers" | "trash" | `folder:${string}`;

interface MailboxSidebarProps {
  activeMailbox: Mailbox;
  onMailboxChange: (mailbox: Mailbox) => void;
  unreadCounts: {
    leads: number;
    unassigned: number;
    contactRequests?: number;
    trash?: number;
  };
  folders: string[];
  folderUnread: Record<string, number>;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (prev: string, next: string) => void;
  onDeleteFolder: (name: string) => void;
  onMoveFolder: (name: string, direction: "up" | "down") => void;
  onOpenSettings?: () => void;
  className?: string;
}

export function MailboxSidebar({
  activeMailbox,
  onMailboxChange,
  unreadCounts,
  folders,
  folderUnread,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveFolder,
  onOpenSettings,
  className,
}: MailboxSidebarProps) {
  const [draftName, setDraftName] = useState("");
  const [showCreator, setShowCreator] = useState(false);
  const [manageMode, setManageMode] = useState(false);
  const [folderAction, setFolderAction] = useState<{ folder: string; type: "rename" | "delete" } | null>(null);

  const mailboxes: { id: Mailbox; label: string; unread: number; icon: React.ElementType }[] = [
    { id: "inbox", label: "Posteingang", unread: unreadCounts.leads + unreadCounts.unassigned, icon: Inbox },
    { id: "contact-requests", label: "Kontaktanfragen", unread: unreadCounts.contactRequests ?? 0, icon: PhoneCall },
    { id: "sent", label: "Gesendet", unread: 0, icon: Send },
    { id: "spam", label: "Spam", unread: 0, icon: ShieldAlert },
    { id: "customers", label: "Kunden", unread: 0, icon: User },
    { id: "trash", label: "Papierkorb", unread: unreadCounts.trash ?? 0, icon: Trash2 },
  ];

  const handleCreate = () => {
    const trimmed = draftName.trim();
    if (!trimmed) return;
    onCreateFolder(trimmed);
    setDraftName("");
    setShowCreator(false);
  };

  return (
    <div
      className={clsx(
        "flex h-full flex-col gap-2 rounded-3xl border bg-[var(--panel-bg)] p-2",
        "border-[color:var(--panel-border)] shadow-[var(--panel-shadow)]",
        className,
      )}
    >
      {mailboxes.map(({ id, label, unread, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onMailboxChange(id)}
          aria-label={label}
          className={clsx(
            "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition",
            activeMailbox === id
              ? "bg-[color:var(--panel-border-strong)] text-[var(--text-primary)]"
              : "text-[var(--text-secondary)] hover:bg-[color:var(--panel-border)]",
          )}
        >
          <Icon className="h-5 w-5" />
          <span className="hidden flex-1 truncate lg:inline text-[var(--text-primary)]">{label}</span>
          {unread > 0 && (
            <span className="rounded-full bg-[color:var(--badge-bg)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--badge-text)]">
              {unread}
            </span>
          )}
        </button>
      ))}

      <div className="my-2 h-px bg-[color:var(--panel-border)]" />
      <div className="flex items-center justify-between px-2 text-xs uppercase tracking-[0.2em] text-[color:var(--text-secondary)]">
        <span className="hidden lg:inline text-[color:var(--text-secondary)]">Ordner</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={clsx(
              "flex h-7 w-7 items-center justify-center rounded-full border text-[var(--text-primary)]",
              "border-[color:var(--panel-border)] hover:bg-[color:var(--panel-border)]",
              showCreator && "bg-[color:var(--panel-border)]",
            )}
            aria-label="Ordner hinzufügen"
            onClick={() => setShowCreator((prev) => !prev)}
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className={clsx(
              "flex h-7 w-7 items-center justify-center rounded-full border text-[var(--text-primary)]",
              "border-[color:var(--panel-border)] hover:bg-[color:var(--panel-border)]",
              manageMode && "bg-[color:var(--panel-border)]",
            )}
            aria-label="Ordner verwalten"
            onClick={() => setManageMode((prev) => !prev)}
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {showCreator && (
        <div className="flex items-center gap-2 px-2 pt-2">
          <div className="flex-1">
            <Input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Neuer Ordner"
              className="h-9 rounded-xl bg-[color:var(--panel-border)] text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreate();
                }
              }}
            />
          </div>
          <button
            type="button"
            onClick={handleCreate}
            className="flex h-9 w-9 items-center justify-center rounded-xl border text-[var(--text-primary)] border-[color:var(--panel-border)] hover:bg-[color:var(--panel-border)]"
            aria-label="Ordner erstellen"
          >
            <FolderPlus className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex-1 space-y-1 px-1 pt-1">
        {folders.length === 0 && (
          <p className="px-2 text-xs text-slate-500">Noch keine Ordner.</p>
        )}
        {folders.map((name) => {
          const id: Mailbox = `folder:${name}`;
          const unread = folderUnread[name] ?? 0;
          return (
            <div key={id} className="space-y-1">
              <button
                type="button"
                onClick={() => onMailboxChange(id)}
                className={clsx(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition",
                  activeMailbox === id
                    ? "bg-[color:var(--panel-border-strong)] text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:bg-[color:var(--panel-border)]",
                )}
              >
                <Folder className="h-5 w-5" />
                <span className="hidden flex-1 truncate lg:inline">{name}</span>
                {!manageMode && unread > 0 && (
                  <span className="rounded-full bg-[color:var(--badge-bg)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--badge-text)]">
                    {unread}
                  </span>
                )}
                {manageMode && (
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      className="rounded-full border border-[color:var(--panel-border)] p-1 text-[var(--text-primary)] hover:bg-[color:var(--panel-border)]"
                      aria-label="Umbenennen"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFolderAction({ folder: name, type: "rename" });
                      }}
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-[color:var(--panel-border)] p-1 text-[var(--text-primary)] hover:bg-[color:var(--panel-border)]"
                      aria-label="Nach oben"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveFolder(name, "up");
                      }}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-[color:var(--panel-border)] p-1 text-[var(--text-primary)] hover:bg-[color:var(--panel-border)]"
                      aria-label="Nach unten"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveFolder(name, "down");
                      }}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-rose-400/40 p-1 text-rose-600 hover:bg-rose-500/10"
                      aria-label="Löschen"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFolderAction({ folder: name, type: "delete" });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </button>

              {manageMode && folderAction?.folder === name && (
                <div className="ml-10 rounded-xl border border-[color:var(--panel-border)] bg-[var(--panel-bg)] p-3 text-sm text-[var(--text-primary)] shadow-[var(--panel-shadow)]">
                  {folderAction.type === "rename" && (
                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-secondary)]">Ordner umbenennen</p>
                      <Input
                        defaultValue={name}
                        autoFocus
                        className="h-9 rounded-lg bg-[color:var(--panel-border)] text-sm"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const next = (e.target as HTMLInputElement).value.trim();
                            if (next && next !== name) {
                              onRenameFolder(name, next);
                              setFolderAction(null);
                            }
                          }
                          if (e.key === "Escape") setFolderAction(null);
                        }}
                        onBlur={(e) => {
                          const next = e.target.value.trim();
                          if (next && next !== name) {
                            onRenameFolder(name, next);
                          }
                          setFolderAction(null);
                        }}
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="rounded-lg border border-[color:var(--panel-border)] px-3 py-1 text-xs text-[var(--text-secondary)] hover:bg-[color:var(--panel-border)]"
                          onClick={() => setFolderAction(null)}
                        >
                          Abbrechen
                        </button>
                        <button
                          type="button"
                          className="rounded-lg bg-[color:var(--panel-border-strong)] px-3 py-1 text-xs text-[var(--text-primary)] hover:opacity-90"
                          onClick={() => {
                            const next = (document.activeElement as HTMLInputElement)?.value?.trim();
                            if (next && next !== name) {
                              onRenameFolder(name, next);
                            }
                            setFolderAction(null);
                          }}
                        >
                          Speichern
                        </button>
                      </div>
                    </div>
                  )}
                  {folderAction.type === "delete" && (
                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-[0.2em] text-rose-500">Ordner löschen</p>
                      <p className="text-xs text-[color:var(--text-secondary)]">Nachrichten bleiben erhalten.</p>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="rounded-lg border border-[color:var(--panel-border)] px-3 py-1 text-xs text-[var(--text-secondary)] hover:bg-[color:var(--panel-border)]"
                          onClick={() => setFolderAction(null)}
                        >
                          Abbrechen
                        </button>
                        <button
                          type="button"
                          className="rounded-lg bg-rose-500/15 px-3 py-1 text-xs text-rose-700 hover:bg-rose-500/25"
                          onClick={() => {
                            onDeleteFolder(name);
                            setFolderAction(null);
                          }}
                        >
                          Löschen
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {onOpenSettings && (
        <button
          type="button"
          onClick={onOpenSettings}
          className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-300 hover:bg-white/5"
        >
          <Inbox className="h-5 w-5" />
          <span className="flex-1">Einstellungen</span>
        </button>
      )}
    </div>
  );
}
