"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // se uno è già loggato e apre /login, mandalo subito dove deve andare
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;

      const uid = data.session.user.id;
      const { data: prof } = await supabase.from("profiles").select("is_admin,password_prompt_pending").eq("id", uid).single();
      const isAdmin = !!prof?.is_admin;
      if (!isAdmin && prof?.password_prompt_pending) {
        window.location.href = "/first-login";
        return;
      }

      const next = new URLSearchParams(window.location.search).get("next");
      if (next) {
        window.location.href = next;
        return;
      }

      window.location.href = isAdmin ? "/admin/events" : "/events";
    })();
  }, []);

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    const em = email.trim().toLowerCase();
    if (!em || !password) {
      setErr("Enter your email and password.");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: em,
        password,
      });

      if (error) throw new Error(error.message);
      if (!data.session) throw new Error("Login failed (missing session).");

      const uid = data.session.user.id;

      // leggi profilo e redireziona
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("is_admin,password_prompt_pending")
        .eq("id", uid)
        .single();

      if (profErr) throw new Error(profErr.message);

      const isAdmin = !!prof?.is_admin;
      if (!isAdmin && prof?.password_prompt_pending) {
        window.location.href = "/first-login";
        return;
      }

      // se esiste ?next=... vai lì, altrimenti routing standard
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.href = next || (isAdmin ? "/admin/events" : "/events");
    } catch (e: any) {
      setErr(e?.message ?? "Login error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* TOPBAR semplice */}
      <div className="topbar">
        <div className="topbar-inner">
          <div className="topbar-left">
            <img src="/logo.svg" alt="La Dogana" className="logo" />
            <span className="admin-brand-label">Guest Portal</span>
          </div>
        </div>
        <div className="green-line" />
      </div>

      <div className="container" style={{ maxWidth: 560 }}>
        <div className="card card-pad" style={{ marginTop: 18 }}>
          <div className="planner-section-kicker">La Dogana · Guest Portal</div>
          <div className="h-serif" style={{ fontSize: 30, fontWeight: 900, marginTop: 6 }}>
            Welcome back
          </div>
          <div className="muted" style={{ marginTop: 6 }}>
            Sign in with the credentials provided by La Dogana.
          </div>

          {err && (
            <div
              className="card card-pad"
              style={{
                marginTop: 12,
                boxShadow: "none",
                borderColor: "rgba(239,68,68,.35)",
                color: "#b91c1c",
                background: "rgba(239,68,68,.06)",
              }}
            >
              {err}
            </div>
          )}

          <form onSubmit={doLogin} style={{ display: "grid", gap: 12, marginTop: 14 }}>
            <div>
              <div className="label">Email</div>
              <input
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                disabled={loading}
                placeholder="name@email.com"
              />
            </div>

            <div>
              <div className="label">Password</div>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={loading}
                placeholder="••••••••"
              />
            </div>

            <button className="btn" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </button>

            <div className="muted" style={{ fontSize: 12 }}>
              Couples will enter their private guest portal. Administrators will be taken to the management dashboard.
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
