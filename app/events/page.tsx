"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import PortalTopbar from "@/app/components/PortalTopbar";

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

const DEFAULT_WELCOME_TITLE = "Welcome to your private area";
const DEFAULT_WELCOME_MESSAGE = `We are delighted that you chose our villa for such a special occasion. This page is designed to make apartment and guest management simple and organised: you can add guest names, note any requirements (such as allergies or intolerances), and assign people to rooms quickly and clearly.

Our goal is to make the planning process as stress-free as possible: we will do our best to accommodate your requests and support you every step of the way, so you can focus on what truly matters. For any questions or special requirements, please contact us through the official channels above.

Thank you again for your trust — we look forward to welcoming you!`;
const DEFAULT_TIP_MESSAGE = "Open the planner and start adding guests. When you are finished, submit the list.";

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
          .select("is_admin,password_prompt_pending")
          .eq("id", uid)
          .single();

        if (profErr) throw new Error(profErr.message);
        if (prof?.is_admin) {
          window.location.href = "/admin/events";
          return;
        }
        if (prof?.password_prompt_pending) {
          window.location.href = "/first-login";
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
          const assigned = guests?.filter((guest: Record<string, any>) => Boolean(guest.apartment_id)).length ?? 0;
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
      <PortalTopbar variant="guest" active="home" />

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
              <div className="couple-hero-kicker">La Dogana Guest Portal</div>
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
          © {new Date().getFullYear()} La Dogana · Guest Portal · Private & secure
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
