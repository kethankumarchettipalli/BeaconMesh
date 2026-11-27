import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, RefreshCw, X, AlertTriangle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";

function formatNotifTime(isoString) {
    try {
        const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
        if (diff < 60)
            return "Just now";
        if (diff < 3600)
            return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400)
            return `${Math.floor(diff / 3600)}h ago`;
        return new Date(isoString).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    }
    catch {
        return "Recently";
    }
}

export function NotificationCenter({
    notifications = [],
    loading = false,
    error = "",
    onMarkRead,
    onMarkAllRead,
    onSelectIncident,
    onRefresh,
    isAuthenticated = false,
}) {
    const [open, setOpen] = useState(false);
    const [markingAll, setMarkingAll] = useState(false);
    const containerRef = useRef(null);
    const isMobile = useIsMobile();

    const unreadCount = notifications.filter((n) => !n.isRead).length;

    useEffect(() => {
        if (!open)
            return;
        const handleOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setOpen(false);
            }
        };
        const handleEscape = (event) => {
            if (event.key === "Escape") {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handleOutside);
        document.addEventListener("keydown", handleEscape);
        return () => {
            document.removeEventListener("mousedown", handleOutside);
            document.removeEventListener("keydown", handleEscape);
        };
    }, [open]);

    const handleMarkAll = async () => {
        if (!onMarkAllRead || unreadCount === 0 || markingAll)
            return;
        setMarkingAll(true);
        try {
            await onMarkAllRead();
        }
        finally {
            setMarkingAll(false);
        }
    };

    const handleItemClick = (item) => {
        if (!item.isRead && onMarkRead) {
            void onMarkRead(item.id);
        }
        if (item.incidentId && onSelectIncident) {
            setOpen(false);
            onSelectIncident(item.incidentId, item);
        }
    };

    const panelClasses = isMobile
        ? "fixed inset-x-3 top-16 z-50 flex max-h-[75svh] flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xl"
        : "absolute right-0 top-full z-50 mt-2 flex max-h-[72svh] w-96 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xl";

    return (
        <div ref={containerRef} className="relative">
            <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"}
                aria-expanded={open}
                aria-haspopup="dialog"
                title="Notifications"
                onClick={() => setOpen((prev) => !prev)}
                className="relative"
            >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                    <span
                        data-testid="notification-unread-badge"
                        className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-urgent px-1 text-[10px] font-bold leading-none text-white"
                    >
                        {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                )}
            </Button>

            {open && (
                <section
                    role="dialog"
                    aria-label="Notification center"
                    className={panelClasses}
                >
                    <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                        <div className="flex min-w-0 items-center gap-2">
                            <h2 className="truncate font-display text-sm font-semibold">Notifications</h2>
                            {unreadCount > 0 && (
                                <span className="rounded-full bg-signal/10 px-2 py-0.5 text-[11px] font-semibold text-signal">
                                    {unreadCount} new
                                </span>
                            )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                            {onRefresh && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => void onRefresh()}
                                    aria-label="Refresh notifications"
                                    title="Refresh notifications"
                                >
                                    <RefreshCw className="h-3.5 w-3.5" />
                                </Button>
                            )}
                            {unreadCount > 0 && onMarkAllRead && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2 text-xs"
                                    disabled={markingAll}
                                    onClick={() => void handleMarkAll()}
                                >
                                    <CheckCheck className="mr-1 h-3.5 w-3.5" />
                                    Mark all read
                                </Button>
                            )}
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setOpen(false)}
                                aria-label="Close notifications"
                            >
                                <X className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto divide-y divide-border">
                        {!isAuthenticated ? (
                            <div className="p-5 text-center text-xs text-muted-foreground">
                                Sign in to receive real-time operational notifications.
                            </div>
                        ) : loading && notifications.length === 0 ? (
                            <div className="flex items-center justify-center gap-2 p-6 text-xs text-muted-foreground">
                                <Clock className="h-4 w-4 animate-spin" />
                                Loading notifications...
                            </div>
                        ) : error && notifications.length === 0 ? (
                            <div className="space-y-2 p-5 text-center">
                                <p className="text-xs text-urgent">{error}</p>
                                {onRefresh && (
                                    <Button type="button" size="sm" variant="outline" onClick={() => void onRefresh()}>
                                        Retry
                                    </Button>
                                )}
                            </div>
                        ) : notifications.length === 0 ? (
                            <div className="p-6 text-center text-xs text-muted-foreground">
                                No operational notifications yet.
                            </div>
                        ) : (
                            notifications.map((item) => {
                                const isUrgent = item.priority === "CRITICAL" || item.priority === "HIGH";
                                return (
                                    <div
                                        key={item.id}
                                        className={`px-4 py-3 transition-colors ${
                                            !item.isRead
                                                ? "border-l-2 border-l-signal bg-signal/5"
                                                : "bg-background opacity-80"
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handleItemClick(item)}
                                                className="min-w-0 flex-1 text-left focus:outline-none"
                                            >
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    {isUrgent && (
                                                        <span
                                                            className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                                                                item.priority === "CRITICAL"
                                                                    ? "bg-urgent/15 text-urgent"
                                                                    : "bg-signal/15 text-signal"
                                                            }`}
                                                        >
                                                            {item.priority === "CRITICAL" && (
                                                                <AlertTriangle className="h-2.5 w-2.5" />
                                                            )}
                                                            {item.priority}
                                                        </span>
                                                    )}
                                                    {item.incidentId && (
                                                        <span className="font-mono text-[11px] font-semibold text-signal">
                                                            {item.incidentId}
                                                        </span>
                                                    )}
                                                    {item.isLocalOnly && (
                                                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                                            Local
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="mt-1 break-words text-sm font-medium text-foreground">
                                                    {item.title}
                                                </p>
                                                <p className="mt-0.5 break-words text-xs leading-relaxed text-muted-foreground">
                                                    {item.message}
                                                </p>
                                                <p className="mt-1.5 text-[11px] text-muted-foreground">
                                                    {formatNotifTime(item.createdAt)}
                                                </p>
                                            </button>
                                            {!item.isRead && onMarkRead && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="min-h-9 shrink-0 px-2 text-[11px] text-signal"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        void onMarkRead(item.id);
                                                    }}
                                                >
                                                    Mark read
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </section>
            )}
        </div>
    );
}
