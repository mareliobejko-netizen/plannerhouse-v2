"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { requireAdminOrRedirect } from "@/lib/requireAdmin";

const DEFAULT_WELCOME_TITLE = "Welcome to your private area";
const DEFAULT_WELCOME_MESSAGE = `We are delighted that you chose our villa for such a special occasion. This page is designed to make apartment and guest management simple and organised: you can add guest names, note any requirements (such as allergies or intolerances), and assign people to rooms quickly and clearly.

Our goal is to make the planning process as stress-free as possible: we will do our best to accommodate your requests and support you every step of the way, so you can focus on what truly matters. For any questions or special requirements, please contact us through the official channels above.

Thank you again for your trust — we look forward to welcoming you!`;
const DEFAULT_TIP_MESSAGE = "Open the planner and start adding guests. When you are finished, submit the list.";

type EventRow = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: "draft" | "submitted" | "final";
  created_at: string;
  created_by: string;
};

type GuestMini = {
  event_id: string;
  apartment_id: string | null;
};

type EventStats = {
  total: number;
  assigned: number;
  unassigned: number;
};

type StatusFilter = "all" | "draft" | "submitted" | "final" | "upcoming" | "past";
type SortMode = "nearest" | "created" | "submitted";

type CreatedInvite = {
  fullName: string;
  email: string;
  password: string;
  eventName: string;
  portalUrl: string;
};

function generatePassword(length = 16) {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%";
  const all = upper + lower + digits + symbols;
  const required = [upper, lower, digits, symbols].map((set) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length]);
  const chars = [...required];
  const random = crypto.getRandomValues(new Uint32Array(Math.max(0, length - required.length)));
  for (const value of random) chars.push(all[value % all.length]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function parseDateOnly(value: string | null, endOfDay = false) {
  if (!value) return null;

  // Accept both PostgreSQL DATE (YYYY-MM-DD) and ISO timestamps returned by drivers.
  const datePart = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (!datePart) return null;

  const parsed = new Date(`${datePart}T${endOfDay ? "23:59:59" : "12:00:00"}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function fmtDate(d: string | null) {
  const date = parseDateOnly(d);
  if (!date) return "Date not set";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function daysUntil(date: string | null) {
  const target = parseDateOnly(date);
  if (!target) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function eventStatusLabel(status: EventRow["status"]) {
  if (status === "submitted") return "Submitted";
  if (status === "final") return "Final";
  return "Draft";
}

export default function AdminEventsPage() {
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<EventRow[]>([]);
  const [guestStats, setGuestStats] = useState<Record<string, EventStats>>({});
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("nearest");

  const [newEmail, setNewEmail] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newName, setNewName] = useState("");
  const [newEventName, setNewEventName] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [newWelcomeTitle, setNewWelcomeTitle] = useState(DEFAULT_WELCOME_TITLE);
  const [newWelcomeMessage, setNewWelcomeMessage] = useState(DEFAULT_WELCOME_MESSAGE);
  const [newTipMessage, setNewTipMessage] = useState(DEFAULT_TIP_MESSAGE);
  const [newTutorialVideoUrl, setNewTutorialVideoUrl] = useState("");
  const [createMsg, setCreateMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [createdInvite, setCreatedInvite] = useState<CreatedInvite | null>(null);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);

  function resetCreateForm() {
    setCreateMsg(null);
    setCreatedInvite(null);
    setCopyMsg(null);
    setNewEmail("");
    setNewPass("");
    setNewName("");
    setNewEventName("");
    setNewStart("");
    setNewEnd("");
    setNewWelcomeTitle(DEFAULT_WELCOME_TITLE);
    setNewWelcomeMessage(DEFAULT_WELCOME_MESSAGE);
    setNewTipMessage(DEFAULT_TIP_MESSAGE);
    setNewTutorialVideoUrl("");
  }

  async function load() {
    setErr(null);
    setLoading(true);
    try {
      await requireAdminOrRedirect();

      const [{ data: eventsData, error: eventsError }, { data: guestsData, error: guestsError }] = await Promise.all([
        supabase.from("events").select("id,name,start_date,end_date,status,created_at,created_by").order("created_at", { ascending: false }),
        supabase.from("guests").select("event_id,apartment_id"),
      ]);

      if (eventsError) throw new Error(eventsError.message);
      if (guestsError) throw new Error(guestsError.message);

      const stats: Record<string, EventStats> = {};
      for (const guest of (guestsData ?? []) as GuestMini[]) {
        if (!stats[guest.event_id]) stats[guest.event_id] = { total: 0, assigned: 0, unassigned: 0 };
        stats[guest.event_id].total += 1;
        if (guest.apartment_id) stats[guest.event_id].assigned += 1;
        else stats[guest.event_id].unassigned += 1;
      }

      setRows((eventsData ?? []) as EventRow[]);
      setGuestStats(stats);
    } catch (e: any) {
      setErr(e?.message ?? "Error loading events");
    } finally {
      setLoading(false);
    }
  }

  async function createUserAndEvent() {
    setCreateMsg(null);

    const email = newEmail.trim().toLowerCase();
    const password = newPass;
    const eventName = newEventName.trim();

    if (!email || !password || !eventName) {
      setCreateMsg({ type: "err", text: "Complete at least: Email, Password, and Event name." });
      return;
    }
    if (password.length < 8) {
      setCreateMsg({ type: "err", text: "Password is too short (minimum 8 characters)." });
      return;
    }

    setCreating(true);
    try {
      await requireAdminOrRedirect();
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) throw new Error("Session expired. Please sign in again.");

      const res = await fetch("/api/admin/create-user-and-event", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          full_name: newName.trim() || undefined,
          event_name: eventName,
          start_date: newStart || null,
          end_date: newEnd || null,
          welcome_title: newWelcomeTitle.trim() || DEFAULT_WELCOME_TITLE,
          welcome_message: newWelcomeMessage.trim() || DEFAULT_WELCOME_MESSAGE,
          tip_message: newTipMessage.trim() || DEFAULT_TIP_MESSAGE,
          tutorial_video_url: newTutorialVideoUrl.trim() || null,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Creation error");

      setCreateMsg({ type: "ok", text: "User and event created successfully." });
      setCreatedInvite({
        fullName: newName.trim(),
        email,
        password,
        eventName,
        portalUrl: `${window.location.origin}/login`,
      });
      await load();
    } catch (e: any) {
      setCreateMsg({ type: "err", text: e?.message ?? "Creation error" });
    } finally {
      setCreating(false);
    }
  }

  async function deleteEventFromDashboard(event: EventRow) {
    if (!confirm(`Delete \"${event.name}\" permanently? This also deletes the guest list and apartment assignments for this event.`)) return;
    try {
      const response = await fetch(`/api/admin/events/${encodeURIComponent(event.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error ?? "Unable to delete event");
      await load();
    } catch (error: any) {
      setErr(error?.message ?? "Unable to delete event");
    }
  }

  function invitationMessage(invite: CreatedInvite) {
    const greetingName = invite.fullName || "there";
    return `Hi ${greetingName},

La Dogana has created your private guest planning area for ${invite.eventName}.

You can access the La Dogana Guest Portal here:
${invite.portalUrl}

Email: ${invite.email}
Temporary password: ${invite.password}

From your private area, you can add your guests, assign apartments, provide important information and submit your final guest list directly to La Dogana.

On your first login, you can choose whether to keep this password or create a personal one.

We look forward to welcoming you to La Dogana.

La Dogana Team`;
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyMsg(`${label} copied.`);
      setTimeout(() => setCopyMsg(null), 1800);
    } catch {
      setCopyMsg("Copy failed. Select the text manually.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dashboard = useMemo(() => {
    const active = rows.filter((ev) => ev.status !== "final").length;
    const submitted = rows.filter((ev) => ev.status === "submitted").length;
    const guests = Object.values(guestStats).reduce((sum, item) => sum + item.total, 0);
    const unassigned = Object.values(guestStats).reduce((sum, item) => sum + item.unassigned, 0);
    return { active, submitted, guests, unassigned };
  }, [rows, guestStats]);

  const attention = useMemo(() => {
    return rows
      .map((ev) => ({ ev, stats: guestStats[ev.id] ?? { total: 0, assigned: 0, unassigned: 0 }, days: daysUntil(ev.start_date) }))
      .filter(({ ev, stats, days }) => ev.status === "submitted" || stats.unassigned > 0 || (days != null && days >= 0 && days <= 7))
      .sort((a, b) => {
        if (a.ev.status === "submitted" && b.ev.status !== "submitted") return -1;
        if (b.ev.status === "submitted" && a.ev.status !== "submitted") return 1;
        return (a.days ?? 99999) - (b.days ?? 99999);
      })
      .slice(0, 4);
  }, [rows, guestStats]);

  const filtered = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let data = [...rows];
    const query = q.trim().toLowerCase();
    if (query) data = data.filter((ev) => ev.name.toLowerCase().includes(query));

    if (["draft", "submitted", "final"].includes(statusFilter)) {
      data = data.filter((ev) => ev.status === statusFilter);
    } else if (statusFilter === "upcoming") {
      data = data.filter((ev) => { const d = parseDateOnly(ev.start_date); return !d || d >= today; });
    } else if (statusFilter === "past") {
      data = data.filter((ev) => { const d = parseDateOnly(ev.end_date, true); return !!d && d < today; });
    }

    data.sort((a, b) => {
      if (sortMode === "created") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortMode === "submitted") {
        if (a.status === "submitted" && b.status !== "submitted") return -1;
        if (b.status === "submitted" && a.status !== "submitted") return 1;
      }
      const ad = parseDateOnly(a.start_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bd = parseDateOnly(b.start_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return ad - bd;
    });

    return data;
  }, [rows, q, statusFilter, sortMode]);

  return (
    <>
      <div className="topbar admin-topbar">
        <div className="green-line" />
        <div className="topbar-inner">
          <div className="topbar-left">
            <img src="/logo.svg" className="logo" alt="Villa logo" />
            <span className="admin-brand-label">Admin</span>
          </div>
          <div className="admin-top-actions">
            <button className="btn admin-create-top" onClick={() => setCreateOpen(true)}>＋ Create new event</button>
            <button className="btn-ghost" onClick={() => (window.location.href = "/admin/users")}>User management</button>
            <button className="btn-ghost" onClick={() => (window.location.href = "/events")}>Client area</button>
            <button className="btn-ghost" onClick={async () => { await supabase.auth.signOut(); window.location.href = "/login"; }}>Logout</button>
          </div>
        </div>
        <div className="green-line" />
      </div>

      <main className="container admin-dashboard">
        <section className="admin-hero">
          <div>
            <div className="admin-eyebrow">La Dogana administration</div>
            <h1>Welcome back</h1>
            <p>Here is what needs your attention today.</p>
          </div>
          <div className="admin-hero-actions">
            <button className="admin-hero-create" onClick={() => setCreateOpen(true)}>
              <span>＋</span>
              <div><strong>Create new event</strong><small>Create the couple account and their private area</small></div>
            </button>
            <button className="admin-hero-create secondary" onClick={() => (window.location.href = "/admin/users")}>
              <span>◎</span>
              <div><strong>Manage users</strong><small>Edit login details, passwords and old accounts</small></div>
            </button>
          </div>
        </section>

        {err && <div className="card card-pad admin-alert error">{err}</div>}

        <section className="admin-stat-grid">
          <div className="admin-stat-card"><span className="admin-stat-icon">◇</span><div><strong>{dashboard.active}</strong><small>Active events</small></div></div>
          <div className="admin-stat-card attention"><span className="admin-stat-icon">!</span><div><strong>{dashboard.submitted}</strong><small>Lists to review</small></div></div>
          <div className="admin-stat-card"><span className="admin-stat-icon">◎</span><div><strong>{dashboard.guests}</strong><small>Guests registered</small></div></div>
          <div className="admin-stat-card warning"><span className="admin-stat-icon">↗</span><div><strong>{dashboard.unassigned}</strong><small>Guests unassigned</small></div></div>
        </section>

        <section className="admin-attention-section">
          <div className="admin-section-head">
            <div><div className="admin-eyebrow">Priority</div><h2>Needs attention</h2></div>
            <button className="btn-ghost btn-sm" onClick={load}>Refresh dashboard</button>
          </div>

          {loading ? (
            <div className="card card-pad muted">Loading dashboard…</div>
          ) : attention.length === 0 ? (
            <div className="admin-empty-state card card-pad"><strong>Everything looks good</strong><span>There are no submitted lists or urgent assignments to review.</span></div>
          ) : (
            <div className="admin-attention-list">
              {attention.map(({ ev, stats, days }) => {
                const isSubmitted = ev.status === "submitted";
                const message = isSubmitted
                  ? "Guest list submitted and ready for review"
                  : stats.unassigned > 0
                    ? `${stats.unassigned} guest${stats.unassigned === 1 ? "" : "s"} still unassigned`
                    : days === 0 ? "Event starts today" : `Event starts in ${days} day${days === 1 ? "" : "s"}`;
                return (
                  <article key={ev.id} className={`admin-attention-card ${isSubmitted ? "submitted" : ""}`}>
                    <div className="admin-attention-marker">{isSubmitted ? "✓" : "!"}</div>
                    <div className="admin-attention-copy">
                      <strong>{ev.name}</strong>
                      <span>{message}</span>
                      <small>{stats.total} guests · {stats.assigned} assigned · {fmtDate(ev.start_date)}</small>
                    </div>
                    <button className="btn" onClick={() => (window.location.href = `/admin/events/${ev.id}`)}>{isSubmitted ? "Review list" : "Open event"}</button>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="admin-events-section">
          <div className="admin-section-head admin-events-head">
            <div><div className="admin-eyebrow">Overview</div><h2>Events</h2></div>
            <div className="admin-event-tools">
              <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by couple or event…" />
              <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
                <option value="nearest">Nearest event first</option>
                <option value="created">Recently created</option>
                <option value="submitted">Submitted first</option>
              </select>
            </div>
          </div>

          <div className="admin-filter-tabs">
            {(["all", "draft", "submitted", "final", "upcoming", "past"] as StatusFilter[]).map((filter) => (
              <button key={filter} className={statusFilter === filter ? "active" : ""} onClick={() => setStatusFilter(filter)}>
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="card card-pad muted">Loading events…</div>
          ) : filtered.length === 0 ? (
            <div className="admin-empty-state card card-pad"><strong>No events found</strong><span>Try changing the filters or create a new event.</span></div>
          ) : (
            <div className="admin-event-grid">
              {filtered.map((ev) => {
                const stats = guestStats[ev.id] ?? { total: 0, assigned: 0, unassigned: 0 };
                const pct = stats.total > 0 ? Math.round((stats.assigned / stats.total) * 100) : 0;
                const days = daysUntil(ev.start_date);
                return (
                  <article key={ev.id} className="admin-event-card">
                    <div className="admin-event-card-top">
                      <span className={`admin-status-chip ${ev.status}`}>{eventStatusLabel(ev.status)}</span>
                      {days != null && days >= 0 && <span className="admin-days-chip">{days === 0 ? "Today" : `${days} days`}</span>}
                    </div>
                    <h3>{ev.name}</h3>
                    <p>{fmtDate(ev.start_date)} <span>→</span> {fmtDate(ev.end_date)}</p>

                    <div className="admin-progress-copy"><strong>{stats.assigned} of {stats.total} assigned</strong><span>{pct}%</span></div>
                    <div className="admin-progress-track"><div style={{ width: `${pct}%` }} /></div>

                    <div className="admin-event-mini-stats">
                      <div><strong>{stats.total}</strong><span>Guests</span></div>
                      <div><strong>{stats.assigned}</strong><span>Assigned</span></div>
                      <div><strong>{stats.unassigned}</strong><span>Unassigned</span></div>
                    </div>

                    <div className="admin-event-actions">
                      <button className="btn-ghost admin-danger-button" onClick={() => deleteEventFromDashboard(ev)}>Delete</button>
                      <button className="btn-ghost" onClick={() => (window.location.href = `/events/${ev.id}`)}>Client view</button>
                      <button className="btn" onClick={() => (window.location.href = `/admin/events/${ev.id}`)}>Open event →</button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {createOpen && (
        <div className="admin-create-backdrop" onMouseDown={() => !creating && setCreateOpen(false)}>
          <div className="admin-create-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="admin-create-head">
              <div><div className="admin-eyebrow">New private area</div><h2>Create user + event</h2><p>Create the couple account, event dates, welcome message and tutorial.</p></div>
              <button className="admin-close-button" onClick={() => !creating && setCreateOpen(false)} aria-label="Close">×</button>
            </div>

            <div className="admin-create-body">
              {createMsg && <div className={`admin-create-message ${createMsg.type}`}>{createMsg.text}</div>}

              {createdInvite && (
                <div className="admin-invite-generated">
                  <div className="admin-invite-generated-head">
                    <div>
                      <span>Ready to copy</span>
                      <strong>Guest invitation message</strong>
                    </div>
                    <div className="admin-invite-actions">
                      <button type="button" className="btn-ghost btn-sm" onClick={() => copyText(`Email: ${createdInvite.email}\nPassword: ${createdInvite.password}\nPortal: ${createdInvite.portalUrl}`, "Credentials")}>Copy credentials</button>
                      <button type="button" className="btn btn-sm" onClick={() => copyText(invitationMessage(createdInvite), "Message")}>Copy message</button>
                    </div>
                  </div>
                  <textarea className="input admin-invite-textarea" rows={13} readOnly value={invitationMessage(createdInvite)} />
                  <div className="admin-invite-note"><strong>No email has been sent.</strong> This message was generated automatically only to help the admin. Copy it and paste it into the email you want to send.</div>
                  {copyMsg && <div className="admin-copy-message">{copyMsg}</div>}
                </div>
              )}

              <div className="admin-create-section">
                <div className="admin-create-section-title"><span>1</span><div><strong>Couple account</strong><small>Login details for the private area</small></div></div>
                <div className="admin-form-grid">
                  <div><div className="label">Full name (optional)</div><input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} disabled={creating} /></div>
                  <div><div className="label">Email</div><input className="input" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} disabled={creating} /></div>
                  <div>
                    <div className="label">Temporary password</div>
                    <div className="admin-password-field">
                      <input className="input" value={newPass} onChange={(e) => setNewPass(e.target.value)} disabled={creating} placeholder="Enter or generate a password" />
                      <button type="button" className="btn-ghost admin-generate-password" onClick={() => setNewPass(generatePassword())} disabled={creating}>Generate</button>
                    </div>
                  </div>
                  <div><div className="label">Event name</div><input className="input" value={newEventName} onChange={(e) => setNewEventName(e.target.value)} disabled={creating} placeholder="e.g. Marco & Giulia Wedding" /></div>
                </div>
              </div>

              <div className="admin-create-section">
                <div className="admin-create-section-title"><span>2</span><div><strong>Event dates</strong><small>These dates control guest check-in and check-out</small></div></div>
                <div className="admin-form-grid">
                  <div><div className="label">Start date</div><input className="input" type="date" value={newStart} onChange={(e) => setNewStart(e.target.value)} disabled={creating} /></div>
                  <div><div className="label">End date</div><input className="input" type="date" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} disabled={creating} /></div>
                </div>
              </div>

              <div className="admin-create-section">
                <div className="admin-create-section-title"><span>3</span><div><strong>Couple welcome page</strong><small>Personalise what the couple sees after signing in</small></div></div>
                <div className="admin-form-stack">
                  <div><div className="label">Page title</div><input className="input" value={newWelcomeTitle} onChange={(e) => setNewWelcomeTitle(e.target.value)} disabled={creating} /></div>
                  <div><div className="label">Personalised welcome message</div><textarea className="input" rows={7} value={newWelcomeMessage} onChange={(e) => setNewWelcomeMessage(e.target.value)} disabled={creating} /></div>
                  <div><div className="label">Tip message</div><textarea className="input" rows={2} value={newTipMessage} onChange={(e) => setNewTipMessage(e.target.value)} disabled={creating} /></div>
                  <div><div className="label">Tutorial video URL (optional)</div><input className="input" type="url" value={newTutorialVideoUrl} onChange={(e) => setNewTutorialVideoUrl(e.target.value)} disabled={creating} placeholder="https://www.youtube.com/watch?v=..." /></div>
                </div>
              </div>
            </div>

            <div className="admin-create-footer">
              <button className="btn-ghost" onClick={resetCreateForm} disabled={creating}>{createdInvite ? "Create another" : "Clear form"}</button>
              <div><button className="btn-ghost" onClick={() => setCreateOpen(false)} disabled={creating}>{createdInvite ? "Close" : "Cancel"}</button>{!createdInvite && <button className="btn" onClick={createUserAndEvent} disabled={creating}>{creating ? "Creating…" : "Create user & event"}</button>}</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
