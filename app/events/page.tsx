"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type EventRow = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: "draft" | "submitted" | "final";
  created_at: string;
  welcome_title: string | null;
  welcome_message: string | null;
  tip_message: string | null;
  tutorial_video_url: string | null;
};

const WEBSITE_URL = "https://agriturismodogana.it/"; // TODO: cambia
const INSTAGRAM_URL = "https://www.instagram.com/luciasitalia/"; // TODO: cambia
const FACEBOOK_URL = "https://www.facebook.com/agriturismodogana.it/"; // TODO: cambia

const DEFAULT_WELCOME_TITLE = "Welcome to your private area";
const DEFAULT_WELCOME_MESSAGE = `We are delighted that you chose our villa for such a special occasion. This page is designed to make apartment and guest management simple and organised: you can add guest names, note any requirements (such as allergies or intolerances), and assign people to rooms quickly and clearly.

Our goal is to make the planning process as stress-free as possible: we will do our best to accommodate your requests and support you every step of the way, so you can focus on what truly matters. For any questions or special requirements, please contact us through the official channels above.

Thank you again for your trust — we look forward to welcoming you!`;
const DEFAULT_TIP_MESSAGE = "Open the planner and start adding guests. When you are finished, submit the list.";

function IconGlobe(props: { size?: number }) {
  const s = props.size ?? 18;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 22a10 10 0 1 0-10-10 10 10 0 0 0 10 10Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M2 12h20"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M12 2c3 2.9 5 6.4 5 10s-2 7.1-5 10c-3-2.9-5-6.4-5-10s2-7.1 5-10Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconInstagram(props: { size?: number }) {
  const s = props.size ?? 18;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M12 16.2a4.2 4.2 0 1 0-4.2-4.2A4.2 4.2 0 0 0 12 16.2Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M17.6 6.6h.01"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconFacebook(props: { size?: number }) {
  const s = props.size ?? 18;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 8.5V7.2c0-.9.6-1.2 1.2-1.2H17V2.8h-2.7c-2.9 0-4.3 1.8-4.3 4.2v1.5H7v3.2h3V22h4v-10.3h3l.7-3.2H14Z"
        fill="currentColor"
      />
    </svg>
  );
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return d;
}


function getVideoEmbedUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);

    if (url.hostname.includes("youtube.com")) {
      const id = url.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}?autoplay=1`;

      const parts = url.pathname.split("/").filter(Boolean);
      const shortIndex = parts.findIndex((part) => part === "shorts" || part === "embed");
      if (shortIndex >= 0 && parts[shortIndex + 1]) {
        return `https://www.youtube.com/embed/${parts[shortIndex + 1]}?autoplay=1`;
      }
    }

    if (url.hostname === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      if (id) return `https://www.youtube.com/embed/${id}?autoplay=1`;
    }

    if (url.hostname.includes("vimeo.com")) {
      const id = url.pathname.split("/").filter(Boolean).pop();
      if (id) return `https://player.vimeo.com/video/${id}?autoplay=1`;
    }

    return rawUrl;
  } catch {
    return rawUrl;
  }
}

function statusBadge(status: EventRow["status"]) {
  if (status === "draft") return { text: "Draft", cls: "badge draft" };
  if (status === "submitted") return { text: "Submitted", cls: "badge submitted" };
  return { text: "Final", cls: "badge final" };
}

export default function EventsHomePage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [event, setEvent] = useState<EventRow | null>(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [guestStats, setGuestStats] = useState({ total: 0, assigned: 0, unassigned: 0 });

  async function loadMySingleEvent(uid: string) {
    // 1) prova come owner (created_by)
    const owned = await supabase
      .from("events")
      .select("id,name,start_date,end_date,status,created_at,welcome_title,welcome_message,tip_message,tutorial_video_url")
      .eq("created_by", uid)
      .order("created_at", { ascending: false })
      .limit(1);

    if (owned.error) throw new Error(owned.error.message);
    if (owned.data && owned.data.length > 0) return owned.data[0] as EventRow;

    // 2) fallback: membership
    const mem = await supabase
      .from("event_members")
      .select("event_id")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(1);

    if (mem.error) throw new Error(mem.error.message);
    const eventId = mem.data?.[0]?.event_id;
    if (!eventId) return null;

    const ev = await supabase
      .from("events")
      .select("id,name,start_date,end_date,status,created_at,welcome_title,welcome_message,tip_message,tutorial_video_url")
      .eq("id", eventId)
      .single();

    if (ev.error) throw new Error(ev.error.message);
    return ev.data as EventRow;
  }

  useEffect(() => {
    (async () => {
      try {
        setErr(null);
        const { data } = await supabase.auth.getSession();
        const session = data.session;

        if (!session) {
          window.location.href = "/login";
          return;
        }

        const uid = session.user.id;

        // admin? -> admin dashboard
        const { data: prof, error: profErr } = await supabase
          .from("profiles")
          .select("is_admin")
          .eq("id", uid)
          .single();

        if (profErr) throw new Error(profErr.message);
        if (prof?.is_admin) {
          window.location.href = "/admin/events";
          return;
        }

        const e = await loadMySingleEvent(uid);
        setEvent(e);

        if (e) {
          const { data: guests, error: guestsErr } = await supabase
            .from("guests")
            .select("id,apartment_id")
            .eq("event_id", e.id);

          if (guestsErr) throw new Error(guestsErr.message);

          const total = guests?.length ?? 0;
          const assigned = guests?.filter((guest) => Boolean(guest.apartment_id)).length ?? 0;
          setGuestStats({ total, assigned, unassigned: Math.max(0, total - assigned) });
        }
      } catch (e: any) {
        setErr(e?.message ?? "Loading error");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <>
      {/* TOPBAR */}
      <div className="topbar">
        <div className="topbar-inner">
          <div className="topbar-left">
            <img src="/logo.svg" alt="Villa logo" className="logo" />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <a className="btn-ghost social-btn" href={WEBSITE_URL} target="_blank" rel="noreferrer" aria-label="Open website">
  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
    <IconGlobe />
    <span className="social-text">Website</span>
  </span>
</a>


            <a className="btn-ghost social-btn" href={INSTAGRAM_URL} target="_blank" rel="noreferrer" aria-label="Open Instagram">
  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
    <IconInstagram />
    <span className="social-text">Instagram</span>
  </span>
</a>


           <a className="btn-ghost social-btn" href={FACEBOOK_URL} target="_blank" rel="noreferrer" aria-label="Open Facebook">
  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
    <IconFacebook />
    <span className="social-text">Facebook</span>
  </span>
</a>


            <button
              className="btn-ghost"
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = "/login";
              }}
            >
              Logout
            </button>
          </div>
        </div>
        <div className="green-line" />
      </div>

      <main className="container couple-home">
        {err && (
          <div className="card card-pad couple-error">{err}</div>
        )}

        {loading ? (
          <div className="card card-pad couple-loading">
            <div className="muted">Loading your private area…</div>
          </div>
        ) : !event ? (
          <div className="card card-pad couple-empty">
            <div className="h-serif">No event found</div>
            <p>If you believe this is an error, please contact the property administration.</p>
          </div>
        ) : (
          <>
            <section className="couple-hero">
              <div className="couple-hero-kicker">Your private stay planner</div>
              <h1>{event.welcome_title?.trim() || DEFAULT_WELCOME_TITLE}</h1>
              <div className={`couple-welcome-copy ${welcomeOpen ? "is-open" : ""}`}>
                {event.welcome_message?.trim() || DEFAULT_WELCOME_MESSAGE}
              </div>
              <button
                type="button"
                className="couple-read-more"
                onClick={() => setWelcomeOpen((open) => !open)}
                aria-expanded={welcomeOpen}
              >
                {welcomeOpen ? "Show less" : "Read welcome message"}
              </button>
            </section>

            {event.tutorial_video_url && (
              <section className="video-guide-card" aria-labelledby="video-guide-title">
                <div className="video-guide-decoration" aria-hidden="true"><span /><span /><span /></div>
                <div className="video-guide-copy">
                  <div className="video-guide-kicker">2-minute guide</div>
                  <h2 id="video-guide-title">Need a little help getting started?</h2>
                  <p>See how to add guests, record special requirements and assign apartments in just a few simple steps.</p>
                </div>
                <button type="button" className="video-guide-button" onClick={() => setVideoOpen(true)}>
                  <span className="video-guide-play" aria-hidden="true">▶</span>
                  <span>See How It Works</span>
                </button>
              </section>
            )}

            <section className="couple-steps" aria-label="How the planner works">
              <div><span>1</span><strong>Add guests</strong><small>Enter names and requirements</small></div>
              <div><span>2</span><strong>Assign apartments</strong><small>Choose the best room for everyone</small></div>
              <div><span>3</span><strong>Submit the list</strong><small>Send the completed plan to the villa</small></div>
            </section>

            <section className="event-feature-card">
              <div className="event-feature-head">
                <div>
                  <div className="event-eyebrow">Your event</div>
                  <h2>{event.name}</h2>
                  <p>{fmtDate(event.start_date)} <span>—</span> {fmtDate(event.end_date)}</p>
                </div>
                {(() => { const b = statusBadge(event.status); return <span className={b.cls}>{b.text}</span>; })()}
              </div>

              <div className="event-progress-row">
                <div>
                  <strong>{guestStats.assigned} of {guestStats.total} guests assigned</strong>
                  <span>{guestStats.total === 0 ? "Start by adding your first guest" : guestStats.unassigned === 0 ? "Your room plan is complete" : `${guestStats.unassigned} still need an apartment`}</span>
                </div>
                <div className="event-progress-value">{guestStats.total ? Math.round((guestStats.assigned / guestStats.total) * 100) : 0}%</div>
              </div>
              <div className="event-progress-track" aria-hidden="true">
                <div style={{ width: `${guestStats.total ? Math.round((guestStats.assigned / guestStats.total) * 100) : 0}%` }} />
              </div>

              <div className="event-stat-grid">
                <div><strong>{guestStats.total}</strong><span>Total guests</span></div>
                <div><strong>{guestStats.assigned}</strong><span>Assigned</span></div>
                <div><strong>{guestStats.unassigned}</strong><span>Unassigned</span></div>
              </div>

              {(event.tip_message?.trim() || DEFAULT_TIP_MESSAGE) && (
                <div className="event-tip">
                  <span>Tip</span>
                  <p>{event.tip_message?.trim() || DEFAULT_TIP_MESSAGE}</p>
                </div>
              )}

              <button className="event-primary-action" onClick={() => (window.location.href = `/events/${event.id}`)}>
                Open Room Planner <span aria-hidden="true">→</span>
              </button>
            </section>
          </>
        )}

        <footer className="couple-footer">
          © {new Date().getFullYear()} La Dogana · Private area · Your data is handled securely
        </footer>
      </main>

      {videoOpen && event?.tutorial_video_url && (
        <div className="video-modal-backdrop" role="presentation" onMouseDown={() => setVideoOpen(false)}>
          <div
            className="video-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="video-modal-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="video-modal-head">
              <div>
                <div className="video-guide-kicker">Room planner guide</div>
                <h2 id="video-modal-title">See How It Works</h2>
              </div>
              <button
                type="button"
                className="video-modal-close"
                onClick={() => setVideoOpen(false)}
                aria-label="Close video"
              >
                ×
              </button>
            </div>

            <div className="video-modal-frame">
              <iframe
                src={getVideoEmbedUrl(event.tutorial_video_url)}
                title="Room planner tutorial"
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>

            <div className="video-modal-foot">
              <span>Having trouble playing the video?</span>
              <a href={event.tutorial_video_url} target="_blank" rel="noreferrer">
                Open it in a new tab
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
