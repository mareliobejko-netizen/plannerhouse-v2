"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { supabase } from "@/lib/supabaseClient";
import PortalTopbar from "@/app/components/PortalTopbar";

export default function AccountPage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await authClient.getSession();
      if (!data?.user) {
        window.location.href = "/login";
        return;
      }
      setEmail(data.user.email ?? "");
      setName(data.user.name ?? "");
    })();
  }, []);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!currentPassword || !newPassword || !confirmPassword) {
      setMessage({ type: "err", text: "Complete all password fields." });
      return;
    }
    if (newPassword.length < 8) {
      setMessage({ type: "err", text: "Your new password must be at least 8 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: "err", text: "The new passwords do not match." });
      return;
    }

    setBusy(true);
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (result.error) throw new Error(result.error.message || "Unable to change password");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage({ type: "ok", text: "Password updated successfully." });
    } catch (error: any) {
      setMessage({ type: "err", text: error?.message ?? "Unable to change password" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PortalTopbar variant="guest" active="account" />

      <main className="container account-shell">
        <section className="account-hero">
          <div className="planner-section-kicker">Your account</div>
          <h1 className="h-serif">Account settings</h1>
          <p className="muted">Manage your login password for the La Dogana Guest Portal.</p>
        </section>

        <div className="account-grid">
          <section className="card card-pad">
            <div className="label">Name</div>
            <div className="account-readonly-value">{name || "—"}</div>
            <div className="label" style={{ marginTop: 18 }}>Email</div>
            <div className="account-readonly-value">{email || "—"}</div>
            <p className="muted account-helper">If your name or email needs to be changed, please contact La Dogana.</p>
          </section>

          <section className="card card-pad">
            <div className="planner-section-kicker">Security</div>
            <h2 className="h-serif" style={{ marginTop: 4 }}>Change password</h2>
            {message && <div className={`admin-create-message ${message.type}`}>{message.text}</div>}
            <form onSubmit={changePassword} className="account-password-form">
              <div><div className="label">Current password</div><input className="input" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} disabled={busy} /></div>
              <div><div className="label">New password</div><input className="input" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} disabled={busy} /></div>
              <div><div className="label">Confirm new password</div><input className="input" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={busy} /></div>
              <button className="btn" type="submit" disabled={busy}>{busy ? "Updating…" : "Update password"}</button>
            </form>
          </section>
        </div>
      </main>
    </>
  );
}
