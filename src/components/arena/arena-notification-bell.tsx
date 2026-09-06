"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "veil-arena:notifications";
const EVENT_NAME = "veil-arena:notification";

export type ArenaNotification = {
  id: string;
  title: string;
  body: string;
  href?: string;
  createdAt: number;
  read: boolean;
};

type NewArenaNotification = Omit<ArenaNotification, "id" | "createdAt" | "read">;

function readNotifications(): ArenaNotification[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is ArenaNotification => Boolean(item && typeof item === "object" && "id" in item && "title" in item && "body" in item));
  } catch {
    return [];
  }
}

function writeNotifications(items: ArenaNotification[]) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 20)));
    window.dispatchEvent(new Event(EVENT_NAME));
  } catch {
    // Notification UI is best effort and must never block arena actions.
  }
}

export function recordArenaNotification(notification: NewArenaNotification) {
  if (typeof window === "undefined") return;
  const item: ArenaNotification = {
    ...notification,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    read: false,
  };
  writeNotifications([item, ...readNotifications()]);
}

export function ArenaNotificationBell() {
  const [items, setItems] = useState<ArenaNotification[]>([]);
  const [open, setOpen] = useState(false);
  const unreadCount = useMemo(() => items.filter((item) => !item.read).length, [items]);

  useEffect(() => {
    const sync = () => setItems(readNotifications());
    sync();
    window.addEventListener(EVENT_NAME, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT_NAME, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  function markAllRead() {
    const next = items.map((item) => ({ ...item, read: true }));
    setItems(next);
    writeNotifications(next);
  }

  return (
    <div className="arena-notification">
      <button
        className="arena-notification-trigger"
        type="button"
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
        <span>Notifications</span>
        {unreadCount > 0 ? <b aria-label={`${unreadCount} unread`}>{unreadCount > 9 ? "9+" : unreadCount}</b> : null}
      </button>
      {open ? (
        <section className="arena-notification-panel" aria-label="Arena notifications">
          <header><strong>ARENA EVENTS</strong><button type="button" onClick={markAllRead} disabled={!unreadCount}>MARK READ</button></header>
          {items.length ? (
            <ol>
              {items.map((item) => (
                <li className={item.read ? "is-read" : ""} key={item.id}>
                  {item.href ? <Link href={item.href} onClick={markAllRead}><strong>{item.title}</strong><span>{item.body}</span></Link> : <div><strong>{item.title}</strong><span>{item.body}</span></div>}
                </li>
              ))}
            </ol>
          ) : <p>No new arena events.</p>}
        </section>
      ) : null}
    </div>
  );
}
