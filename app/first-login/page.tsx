"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { supabase } from "@/lib/supabaseClient";

export default function FirstLoginPage() {
  const [checking, setChecking] = useState(true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          window.location.href = "/login";
          return;
        }

        const uid = data.session.user.id;
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("is_admin,password_prompt_pending")
          .eq("id", uid)
          .single();

        if (error) throw new Error(error.message);
        if (profile?.is_admin) {
          window.location.href = "/admin/events";
          return;
        }
        if (!profile?.password_prompt_pending) {
          window.location.href = "/events";
          return;
        }
      } catch (error: any) {
        setMessage({ type: "err", text: error?.message ?? "Unable to load your account" });
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  async function dismissPrompt() {
    const response = await fetch("/api/account/password-prompt", {
      method: "POST",
      credentials: "same-origin",
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json?.error ?? "Unable to save your choice");
  }

  async function keepPassword() {
    setBusy(true);
    setMessage(null);
    try {
      await dismissPrompt();
      window.location.href = "/events";
    } catch (error: any) {
      setMessage({ type: "err", text: error?.message ?? "Unable to continue" });
      setBusy(false);
    }
  }

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

      await dismissPrompt();
      setMessage({ type: "ok", text: "Password updated successfully." });
      setTimeout(() => {
        window.location.href = "/events";
      }, 500);
    } catch (error: any) {
      setMessage({ type: "err", text: error?.message ?? "Unable to change password" });
      setBusy(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <div className="topbar-inner">
          <div className="topbar-left"><img src="/logo.svg" alt="La Dogana" className="logo" /></div>
        </div>
        <div className="green-line" />
      </div>

      <main className="container first-login-shell">
        <section className="card card-pad first-login-card">
          <div className="first-login-icon">🔐</div>
          <div className="planner-section-kicker">Welcome to La Dogana Guest Portal</div>
          <h1 className="h-serif">Would you like to create your own password?</h1>
          <p className="muted first-login-intro">
            La Dogana created a temporary password for your account. You can keep it, or choose a personal password now for easier access in the future.
          </p>

          {message && <div className={`admin-create-message ${message.type}`}>{message.text}</div>}

          {checking ? (
            <div className="muted">Checking your account…</div>
          ) : (
            <>
              <form onSubmit={changePassword} className="first-login-form">
                <div>
                  <div className="label">Current password</div>
                  <input className="input" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} disabled={busy} />
                </div>
                <div className="first-login-password-grid">
                  <div>
                    <div className="label">New password</div>
                    <input className="input" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} disabled={busy} />
                  </div>
                  <div>
                    <div className="label">Confirm new password</div>
                    <input className="input" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={busy} />
                  </div>
                </div>
                <button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : "Create my password"}</button>
              </form>

              <div className="first-login-divider"><span>or</span></div>

              <button className="btn-ghost first-login-keep" onClick={keepPassword} disabled={busy}>
                Keep current password
              </button>
              <p className="muted first-login-footnote">You can change your password later from Account.</p>
            </>
          )}
        </section>
      </main>
    </>
  );
}
