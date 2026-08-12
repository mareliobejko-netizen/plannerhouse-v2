"use client";

import { useEffect, useMemo, useState } from "react";
import { requireAdminOrRedirect } from "@/lib/requireAdmin";
import { supabase } from "@/lib/supabaseClient";
import PortalTopbar from "@/app/components/PortalTopbar";

type LinkedEvent = {
  id: string;
  name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  is_owner: boolean;
  member_role: string | null;
};

type AdminUser = {
  id: string;
  name: string | null;
  full_name: string | null;
  email: string;
  role: string | null;
  banned: boolean | null;
  is_admin: boolean | null;
  password_prompt_pending: boolean;
  created_at: string;
  events: LinkedEvent[];
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

function fmtDate(value: string | null) {
  if (!value) return "Date not set";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "Date not set";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [modalMsg, setModalMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      await requireAdminOrRedirect();
      const response = await fetch("/api/admin/users", { credentials: "same-origin" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error ?? "Unable to load users");
      setUsers((json.users ?? []) as AdminUser[]);
    } catch (error: any) {
      setErr(error?.message ?? "Unable to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((user) => `${user.full_name ?? user.name ?? ""} ${user.email}`.toLowerCase().includes(q));
  }, [users, query]);

  function openUser(user: AdminUser) {
    setSelected(user);
    setEditName(user.full_name || user.name || "");
    setEditEmail(user.email || "");
    setNewPassword("");
    setModalMsg(null);
  }

  async function saveDetails() {
    if (!selected) return;
    setBusy(true);
    setModalMsg(null);
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "details", userId: selected.id, name: editName, email: editEmail }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error ?? "Unable to save user details");
      setModalMsg({ type: "ok", text: "User details updated." });
      await load();
      setSelected((current) => current ? { ...current, full_name: editName, name: editName, email: editEmail } : current);
    } catch (error: any) {
      setModalMsg({ type: "err", text: error?.message ?? "Unable to save user details" });
    } finally {
      setBusy(false);
    }
  }

  async function setPassword() {
    if (!selected) return;
    if (newPassword.length < 8) {
      setModalMsg({ type: "err", text: "Password must be at least 8 characters." });
      return;
    }
    setBusy(true);
    setModalMsg(null);
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "password", userId: selected.id, password: newPassword }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error ?? "Unable to set password");
      setModalMsg({ type: "ok", text: "Temporary password updated. The guest will be offered the password choice on their next login." });
      setNewPassword("");
      await load();
    } catch (error: any) {
      setModalMsg({ type: "err", text: error?.message ?? "Unable to set password" });
    } finally {
      setBusy(false);
    }
  }

  async function deleteEvent(event: LinkedEvent) {
    if (!confirm(`Delete \"${event.name}\" permanently? This also deletes the guest list and assignments for this event.`)) return;
    setBusy(true);
    setModalMsg(null);
    try {
      const response = await fetch(`/api/admin/events/${encodeURIComponent(event.id)}`, { method: "DELETE", credentials: "same-origin" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error ?? "Unable to delete event");
      setModalMsg({ type: "ok", text: `Event \"${event.name}\" deleted.` });
      await load();
      setSelected(null);
    } catch (error: any) {
      setModalMsg({ type: "err", text: error?.message ?? "Unable to delete event" });
    } finally {
      setBusy(false);
    }
  }

  async function deleteUser() {
    if (!selected) return;
    if (selected.events.some((event) => event.is_owner)) {
      setModalMsg({ type: "err", text: "Delete this user's owned events first. Then you can delete the account." });
      return;
    }
    if (!confirm(`Delete the user ${selected.email} permanently? This cannot be undone.`)) return;
    setBusy(true);
    setModalMsg(null);
    try {
      const response = await fetch(`/api/admin/users?userId=${encodeURIComponent(selected.id)}`, { method: "DELETE", credentials: "same-origin" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error ?? "Unable to delete user");
      setSelected(null);
      await load();
    } catch (error: any) {
      setModalMsg({ type: "err", text: error?.message ?? "Unable to delete user" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PortalTopbar variant="admin" active="users" />

      <main className="container admin-users-page">
        <section className="admin-users-hero">
          <div><div className="admin-eyebrow">Administration</div><h1 className="h-serif">User management</h1><p>Update guest portal accounts, reset passwords and remove old users or events.</p></div>
          <button className="btn-ghost" onClick={load}>Refresh</button>
        </section>

        {err && <div className="card card-pad admin-alert error">{err}</div>}

        <section className="card card-pad admin-users-toolbar">
          <div>
            <div className="label">Search users</div>
            <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or email…" />
          </div>
          <div className="admin-users-count"><strong>{users.length}</strong><span>Total accounts</span></div>
        </section>

        {loading ? (
          <div className="card card-pad muted">Loading users…</div>
        ) : filtered.length === 0 ? (
          <div className="card card-pad muted">No users found.</div>
        ) : (
          <div className="admin-user-list">
            {filtered.map((user) => {
              const displayName = user.full_name || user.name || user.email;
              return (
                <article className="admin-user-card" key={user.id}>
                  <div className="admin-user-avatar">{displayName.slice(0, 1).toUpperCase()}</div>
                  <div className="admin-user-main">
                    <div className="admin-user-name-row"><strong>{displayName}</strong>{user.is_admin && <span className="admin-user-role admin">Admin</span>}{!user.is_admin && <span className="admin-user-role">Guest</span>}</div>
                    <span>{user.email}</span>
                    <small>{user.events.length} linked event{user.events.length === 1 ? "" : "s"}{user.password_prompt_pending ? " · Password choice pending" : ""}</small>
                  </div>
                  <div className="admin-user-events-mini">
                    {user.events.slice(0, 2).map((event) => <span key={event.id}>{event.name}</span>)}
                    {user.events.length > 2 && <span>+{user.events.length - 2} more</span>}
                  </div>
                  <button className="btn" onClick={() => openUser(user)}>Manage</button>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {selected && (
        <div className="admin-create-backdrop" onMouseDown={() => !busy && setSelected(null)}>
          <div className="admin-user-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="admin-create-head">
              <div><div className="admin-eyebrow">Account</div><h2>{selected.full_name || selected.name || selected.email}</h2><p>{selected.email}</p></div>
              <button className="admin-close-button" onClick={() => !busy && setSelected(null)} aria-label="Close">×</button>
            </div>

            <div className="admin-user-modal-body">
              {modalMsg && <div className={`admin-create-message ${modalMsg.type}`}>{modalMsg.text}</div>}

              <section className="admin-create-section">
                <div className="admin-create-section-title"><span>1</span><div><strong>Account details</strong><small>Change the guest's name or login email</small></div></div>
                <div className="admin-form-grid">
                  <div><div className="label">Full name</div><input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} disabled={busy} /></div>
                  <div><div className="label">Email</div><input className="input" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} disabled={busy} /></div>
                </div>
                <button className="btn" onClick={saveDetails} disabled={busy}>Save details</button>
              </section>

              <section className="admin-create-section">
                <div className="admin-create-section-title"><span>2</span><div><strong>Set a new temporary password</strong><small>The guest will see the password choice again on their next login</small></div></div>
                <div className="admin-password-field">
                  <input className="input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} disabled={busy} placeholder="New temporary password" />
                  <button type="button" className="btn-ghost admin-generate-password" onClick={() => setNewPassword(generatePassword())} disabled={busy}>Generate</button>
                </div>
                <button className="btn" onClick={setPassword} disabled={busy || newPassword.length < 8}>Set password</button>
              </section>

              <section className="admin-create-section">
                <div className="admin-create-section-title"><span>3</span><div><strong>Linked events</strong><small>Open or permanently delete events associated with this user</small></div></div>
                {selected.events.length === 0 ? <p className="muted">No linked events.</p> : (
                  <div className="admin-user-event-list">
                    {selected.events.map((event) => (
                      <div className="admin-user-event-row" key={event.id}>
                        <div><strong>{event.name}</strong><span>{fmtDate(event.start_date)} · {event.status}{event.is_owner ? " · Owner" : ""}</span></div>
                        <div><button className="btn-ghost btn-sm" onClick={() => (window.location.href = `/admin/events/${event.id}`)}>Open</button><button className="btn-ghost btn-sm admin-danger-button" onClick={() => deleteEvent(event)} disabled={busy}>Delete</button></div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {!selected.is_admin && (
                <section className="admin-danger-zone">
                  <div><strong>Delete user account</strong><p>This permanently removes the login. Delete owned events first.</p></div>
                  <button className="btn-ghost admin-danger-button" onClick={deleteUser} disabled={busy}>Delete user</button>
                </section>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
