"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { requireAdminOrRedirect } from "@/lib/requireAdmin";

type OccRow = {
  event_id: string;
  apartment_id: string;
  capacity: number;
  guests_count: number;
  structure: string;
  floor: number;
};

type GuestRow = {
  id: string;
  event_id: string;
  apartment_id: string | null;
  first_name: string;
  last_name: string;
  guest_type: "adult" | "child";
  child_age: number | null;
  arrival_mode: "car" | "transfer" | null;
  checkin_date: string | null;
  checkout_date: string | null;
  extra_nights: number;
  allergies: string | null;
  notes: string | null;
};

type EvRow = {
  id: string;
  name: string;
  status: "draft" | "submitted" | "final";
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  created_by: string;
  submitted_at: string | null;
  submitted_by: string | null;
  welcome_title: string | null;
  welcome_message: string | null;
  tip_message: string | null;
  tutorial_video_url: string | null;
  couple_note: string | null;
  portal_feedback_rating: "loved" | "good" | "could_be_better" | null;
  portal_feedback_comment: string | null;
};

type TabKey = "overview" | "guests" | "apartments" | "settings";
type GuestFilter = "all" | "assigned" | "unassigned" | "allergies" | "early";

function friendlyAptLabel(aptId: string) {
  if (aptId === "apt_wc") return "Woodcutter’s House";
  return `Apartment ${aptId.replace("apt_", "")}`;
}

function guestTypeLabel(g: GuestRow) {
  if (g.guest_type === "child") return `Child${g.child_age != null ? `, ${g.child_age}` : ""}`;
  return "Adult";
}

function toCsvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function safeFileName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "event";
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const datePart = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (!datePart) return value;
  const date = new Date(`${datePart}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export default function AdminEventPage() {
  const params = useParams();
  const eventId = params?.eventId as string | undefined;

  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [guestFilter, setGuestFilter] = useState<GuestFilter>("all");
  const [guestSearch, setGuestSearch] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ev, setEv] = useState<EvRow | null>(null);
  const [occ, setOcc] = useState<OccRow[]>([]);
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [settingsName, setSettingsName] = useState("");
  const [settingsStart, setSettingsStart] = useState("");
  const [settingsEnd, setSettingsEnd] = useState("");
  const [settingsWelcomeTitle, setSettingsWelcomeTitle] = useState("");
  const [settingsWelcomeMessage, setSettingsWelcomeMessage] = useState("");
  const [settingsTip, setSettingsTip] = useState("");
  const [settingsVideo, setSettingsVideo] = useState("");

  async function load() {
    setErr(null);
    setLoading(true);
    try {
      await requireAdminOrRedirect();
      if (!eventId) throw new Error("Missing event ID.");

      const [eventResult, occupancyResult, guestsResult] = await Promise.all([
        supabase
          .from("events")
          .select("id,name,status,start_date,end_date,created_at,created_by,submitted_at,submitted_by,welcome_title,welcome_message,tip_message,tutorial_video_url,couple_note,portal_feedback_rating,portal_feedback_comment")
          .eq("id", eventId)
          .single(),
        supabase
          .from("apartment_occupancy")
          .select("event_id,apartment_id,capacity,guests_count,structure,floor")
          .eq("event_id", eventId),
        supabase
          .from("guests")
          .select("id,event_id,apartment_id,first_name,last_name,guest_type,child_age,arrival_mode,checkin_date,checkout_date,extra_nights,allergies,notes")
          .eq("event_id", eventId)
          .order("last_name", { ascending: true }),
      ]);

      if (eventResult.error) throw new Error(eventResult.error.message);
      if (occupancyResult.error) throw new Error(occupancyResult.error.message);
      if (guestsResult.error) throw new Error(guestsResult.error.message);

      const eventData = eventResult.data as EvRow;
      setEv(eventData);
      setOcc((occupancyResult.data ?? []) as OccRow[]);
      setGuests((guestsResult.data ?? []) as GuestRow[]);

      setSettingsName(eventData.name ?? "");
      setSettingsStart(eventData.start_date ?? "");
      setSettingsEnd(eventData.end_date ?? "");
      setSettingsWelcomeTitle(eventData.welcome_title ?? "");
      setSettingsWelcomeMessage(eventData.welcome_message ?? "");
      setSettingsTip(eventData.tip_message ?? "");
      setSettingsVideo(eventData.tutorial_video_url ?? "");
    } catch (error: any) {
      setErr(error?.message ?? "Loading error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const occupancyMap = useMemo(() => {
    const map = new Map<string, OccRow>();
    occ.forEach((row) => map.set(row.apartment_id, row));
    return map;
  }, [occ]);

  const apartments = useMemo(() => {
    return [...occ].sort((a, b) => {
      const structureOrder = a.structure.localeCompare(b.structure);
      if (structureOrder !== 0) return structureOrder;
      if (a.floor !== b.floor) return a.floor - b.floor;
      return a.apartment_id.localeCompare(b.apartment_id);
    });
  }, [occ]);

  const guestsByApartment = useMemo(() => {
    const map = new Map<string, GuestRow[]>();
    guests.forEach((guest) => {
      const key = guest.apartment_id ?? "__unassigned";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(guest);
    });
    return map;
  }, [guests]);

  const totalGuests = guests.length;
  const assignedGuests = guests.filter((guest) => guest.apartment_id).length;
  const unassignedGuests = guests.filter((guest) => !guest.apartment_id);
  const adultGuests = guests.filter((guest) => guest.guest_type === "adult").length;
  const childGuests = totalGuests - adultGuests;
  const allergyGuests = guests.filter((guest) => !!guest.allergies?.trim());
  const earlyGuests = guests.filter((guest) => ev?.start_date && guest.checkin_date && guest.checkin_date < ev.start_date);
  const transferGuests = guests.filter((guest) => guest.arrival_mode === "transfer").length;
  const extraNightGuests = guests.filter((guest) => Number(guest.extra_nights ?? 0) > 0).length;
  const progress = totalGuests > 0 ? Math.round((assignedGuests / totalGuests) * 100) : 0;
  const fullApartments = apartments.filter((apartment) => apartment.guests_count >= apartment.capacity).length;
  const emptyApartments = apartments.filter((apartment) => apartment.guests_count === 0).length;

  const filteredGuests = useMemo(() => {
    const query = guestSearch.trim().toLowerCase();
    return guests.filter((guest) => {
      const matchesQuery = !query || `${guest.first_name} ${guest.last_name}`.toLowerCase().includes(query);
      if (!matchesQuery) return false;
      if (guestFilter === "assigned") return !!guest.apartment_id;
      if (guestFilter === "unassigned") return !guest.apartment_id;
      if (guestFilter === "allergies") return !!guest.allergies?.trim();
      if (guestFilter === "early") return !!ev?.start_date && !!guest.checkin_date && guest.checkin_date < ev.start_date;
      return true;
    });
  }, [guests, guestFilter, guestSearch, ev?.start_date]);

  async function setStatusAdmin(nextStatus: EvRow["status"]) {
    if (!eventId) return;
    const confirmed = window.confirm(`Change this event status to “${nextStatus}”?`);
    if (!confirmed) return;

    setStatusBusy(true);
    setStatusMsg(null);
    try {
      const { error } = await supabase.rpc("admin_set_event_status", {
        p_event_id: eventId,
        p_status: nextStatus,
      });
      if (error) throw new Error(error.message);
      setStatusMsg({ type: "ok", text: `Status updated to ${nextStatus}.` });
      await load();
    } catch (error: any) {
      setStatusMsg({ type: "err", text: error?.message ?? "Status update failed." });
    } finally {
      setStatusBusy(false);
    }
  }

  async function saveSettings() {
    if (!eventId) return;
    setSettingsBusy(true);
    setSettingsMsg(null);
    try {
      const { error } = await supabase
        .from("events")
        .update({
          name: settingsName.trim(),
          start_date: settingsStart || null,
          end_date: settingsEnd || null,
          welcome_title: settingsWelcomeTitle.trim() || null,
          welcome_message: settingsWelcomeMessage.trim() || null,
          tip_message: settingsTip.trim() || null,
          tutorial_video_url: settingsVideo.trim() || null,
        })
        .eq("id", eventId);
      if (error) throw new Error(error.message);
      setSettingsMsg({ type: "ok", text: "Event settings saved." });
      await load();
    } catch (error: any) {
      setSettingsMsg({ type: "err", text: error?.message ?? "Unable to save settings." });
    } finally {
      setSettingsBusy(false);
    }
  }

  function exportCsv() {
    if (!ev) return;

    const headers = [
      "Event",
      "Status",
      "First name",
      "Last name",
      "Type",
      "Child age",
      "Apartment",
      "Structure",
      "Floor",
      "Arrival",
      "Check-in",
      "Check-out",
      "Extra nights",
      "Allergies / intolerances",
      "Notes",
    ];

    const rows = guests.map((guest) => {
      const apartment = guest.apartment_id ? occupancyMap.get(guest.apartment_id) : null;
      return [
        ev.name,
        ev.status,
        guest.first_name,
        guest.last_name,
        guest.guest_type,
        guest.child_age ?? "",
        guest.apartment_id ? friendlyAptLabel(guest.apartment_id) : "Unassigned",
        apartment?.structure ?? "",
        apartment?.floor ?? "",
        guest.arrival_mode ?? "",
        guest.checkin_date ?? "",
        guest.checkout_date ?? "",
        guest.extra_nights ?? 0,
        guest.allergies ?? "",
        guest.notes ?? "",
      ];
    });

    const csv = [headers, ...rows].map((row) => row.map(toCsvCell).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFileName(ev.name)}-guest-list.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    if (!ev) return;

    const apartmentSections = apartments.map((apartment) => {
      const apartmentGuests = guestsByApartment.get(apartment.apartment_id) ?? [];
      const rows = apartmentGuests.length
        ? apartmentGuests.map((guest) => `
          <tr>
            <td><strong>${escapeHtml(guest.first_name)} ${escapeHtml(guest.last_name)}</strong><br><small>${escapeHtml(guestTypeLabel(guest))}</small></td>
            <td>${escapeHtml(guest.arrival_mode || "—")}</td>
            <td>${escapeHtml(guest.checkin_date || "—")}</td>
            <td>${escapeHtml(guest.checkout_date || "—")}</td>
            <td>${escapeHtml(guest.extra_nights || 0)}</td>
            <td>${escapeHtml(guest.allergies || "—")}</td>
            <td>${escapeHtml(guest.notes || "—")}</td>
          </tr>`).join("")
        : `<tr><td colspan="7" class="empty">No guests assigned.</td></tr>`;

      return `
        <section>
          <div class="section-title">
            <div>
              <h2>${escapeHtml(friendlyAptLabel(apartment.apartment_id))}</h2>
              <p>${escapeHtml(apartment.structure)} · Floor ${escapeHtml(apartment.floor)}</p>
            </div>
            <span>${escapeHtml(apartment.guests_count)}/${escapeHtml(apartment.capacity)}</span>
          </div>
          <table>
            <thead><tr><th>Guest</th><th>Arrival</th><th>Check-in</th><th>Check-out</th><th>Extra</th><th>Allergies</th><th>Notes</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </section>`;
    }).join("");

    const unassignedRows = unassignedGuests.length
      ? unassignedGuests.map((guest) => `<li><strong>${escapeHtml(guest.first_name)} ${escapeHtml(guest.last_name)}</strong> — ${escapeHtml(guestTypeLabel(guest))}${guest.allergies ? ` · ${escapeHtml(guest.allergies)}` : ""}</li>`).join("")
      : "<li>None</li>";

    const report = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(ev.name)} — Guest List</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #304030; font-family: Arial, sans-serif; font-size: 10px; }
  header { border-bottom: 3px solid #304030; padding-bottom: 12px; margin-bottom: 14px; }
  h1, h2 { font-family: Georgia, serif; font-weight: 500; margin: 0; }
  h1 { font-size: 28px; }
  h2 { font-size: 17px; }
  header p, .section-title p { margin: 5px 0 0; color: #667060; }
  .summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin: 14px 0; }
  .summary div { border: 1px solid #ccd4c5; border-radius: 10px; padding: 10px; text-align: center; }
  .summary strong { display: block; font-family: Georgia, serif; font-size: 22px; }
  .summary span { color: #667060; text-transform: uppercase; font-size: 8px; letter-spacing: .08em; }
  .notice { padding: 10px 12px; border-radius: 10px; background: #f3f0df; margin-bottom: 12px; }
  section { break-inside: avoid; margin: 0 0 14px; }
  .section-title { display: flex; align-items: center; justify-content: space-between; margin-bottom: 7px; }
  .section-title > span { border-radius: 999px; background: #e6ecdf; padding: 6px 10px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #d8ddd3; padding: 6px; text-align: left; vertical-align: top; }
  th { background: #e6ecdf; font-size: 8px; text-transform: uppercase; letter-spacing: .05em; }
  td small { color: #667060; }
  .empty { color: #667060; text-align: center; padding: 12px; }
  footer { margin-top: 16px; border-top: 1px solid #ccd4c5; padding-top: 8px; color: #667060; }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(ev.name)}</h1>
  <p>${escapeHtml(formatDate(ev.start_date))} – ${escapeHtml(formatDate(ev.end_date))} · Status: ${escapeHtml(ev.status)}</p>
</header>
<div class="summary">
  <div><strong>${totalGuests}</strong><span>Total guests</span></div>
  <div><strong>${assignedGuests}</strong><span>Assigned</span></div>
  <div><strong>${unassignedGuests.length}</strong><span>Unassigned</span></div>
  <div><strong>${allergyGuests.length}</strong><span>Allergies</span></div>
  <div><strong>${earlyGuests.length}</strong><span>Early arrivals</span></div>
</div>
<div class="notice"><strong>Unassigned guests:</strong><ul>${unassignedRows}</ul></div>
${apartmentSections}
<footer>Generated from La Dogana Admin on ${escapeHtml(formatDateTime(new Date().toISOString()))}.</footer>
<script>window.addEventListener('load', () => { setTimeout(() => window.print(), 250); });</script>
</body>
</html>`;

    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) {
      setStatusMsg({ type: "err", text: "Your browser blocked the PDF window. Allow pop-ups and try again." });
      return;
    }
    printWindow.document.open();
    printWindow.document.write(report);
    printWindow.document.close();
  }

  if (loading || !ev) {
    return (
      <>
        <div className="topbar"><div className="green-line" /><div className="topbar-inner"><img src="/logo.svg" className="logo" alt="Villa logo" /></div><div className="green-line" /></div>
        <div className="container"><div className="card card-pad">{err || "Loading event…"}</div></div>
      </>
    );
  }

  return (
    <>
      <div className="topbar">
        <div className="green-line" />
        <div className="topbar-inner">
          <div className="topbar-left"><img src="/logo.svg" className="logo" alt="Villa logo" /></div>
          <div className="admin-event-top-actions">
            <span className="badge draft">Admin</span>
            <button className="btn-ghost" onClick={() => (window.location.href = "/admin/events")}>← Dashboard</button>
            <button className="btn-ghost" onClick={exportPdf}>Export PDF</button>
            <button className="btn" onClick={exportCsv}>Export CSV</button>
          </div>
        </div>
        <div className="green-line" />
      </div>

      <main className="container admin-event-page">
        {err && <div className="card card-pad admin-event-alert error">{err}</div>}
        {statusMsg && <div className={`card card-pad admin-event-alert ${statusMsg.type}`}>{statusMsg.text}</div>}

        <section className="admin-event-hero">
          <div>
            <div className="admin-event-eyebrow">Event control centre</div>
            <div className="admin-event-title-row">
              <h1>{ev.name}</h1>
              <span className={`admin-event-status ${ev.status}`}>{ev.status}</span>
            </div>
            <p>{formatDate(ev.start_date)} – {formatDate(ev.end_date)}</p>
            {ev.submitted_at && <small>Submitted {formatDateTime(ev.submitted_at)}</small>}
          </div>
          <div className="admin-event-hero-actions">
            <button className="btn-ghost" onClick={() => setActiveTab("settings")}>Edit event</button>
            <button className="btn-ghost" onClick={load}>Refresh</button>
            <button className="btn" onClick={() => setActiveTab("guests")}>View guest list</button>
          </div>
        </section>

        <section className="admin-event-stat-grid">
          <div><strong>{totalGuests}</strong><span>Total guests</span></div>
          <div><strong>{assignedGuests}</strong><span>Assigned</span></div>
          <div><strong>{unassignedGuests.length}</strong><span>Unassigned</span></div>
          <div><strong>{progress}%</strong><span>Completed</span></div>
        </section>

        <section className="card card-pad admin-event-progress-card">
          <div><strong>Room assignment progress</strong><span>{assignedGuests} of {totalGuests} guests assigned</span></div>
          <div className="admin-event-progress"><div style={{ width: `${progress}%` }} /></div>
        </section>

        <section className="admin-event-attention-grid">
          <button className={`admin-attention-card ${unassignedGuests.length ? "warning" : "success"}`} onClick={() => { setGuestFilter("unassigned"); setActiveTab("guests"); }}>
            <span>{unassignedGuests.length ? "Needs attention" : "All assigned"}</span>
            <strong>{unassignedGuests.length} unassigned guests</strong>
            <small>{unassignedGuests.length ? "Open the guest list to review them." : "Every guest has an apartment."}</small>
          </button>
          <button className={`admin-attention-card ${allergyGuests.length ? "warning" : "neutral"}`} onClick={() => { setGuestFilter("allergies"); setActiveTab("guests"); }}>
            <span>Dietary notes</span>
            <strong>{allergyGuests.length} allergy records</strong>
            <small>Review allergies and intolerances before the event.</small>
          </button>
          <button className={`admin-attention-card ${earlyGuests.length ? "warning" : "neutral"}`} onClick={() => { setGuestFilter("early"); setActiveTab("guests"); }}>
            <span>Arrival planning</span>
            <strong>{earlyGuests.length} early arrivals</strong>
            <small>{transferGuests} guests require a transfer.</small>
          </button>
        </section>

        <nav className="admin-event-tabs card card-pad">
          {(["overview", "guests", "apartments", "settings"] as TabKey[]).map((tab) => (
            <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>{tab === "settings" ? "Event settings" : tab[0].toUpperCase() + tab.slice(1)}</button>
          ))}
        </nav>

        {activeTab === "overview" && (
          <section className="admin-event-overview-grid">
            <div className="card card-pad admin-event-panel">
              <div className="admin-event-panel-head"><div><span>Guest breakdown</span><h2>Who is attending</h2></div></div>
              <div className="admin-mini-stat-grid">
                <div><strong>{adultGuests}</strong><span>Adults</span></div>
                <div><strong>{childGuests}</strong><span>Children</span></div>
                <div><strong>{transferGuests}</strong><span>Transfers</span></div>
                <div><strong>{extraNightGuests}</strong><span>Extra nights</span></div>
              </div>
            </div>

            <div className="card card-pad admin-event-panel">
              <div className="admin-event-panel-head"><div><span>Apartment overview</span><h2>Current occupancy</h2></div><button className="btn-sm btn-ghost" onClick={() => setActiveTab("apartments")}>View all</button></div>
              <div className="admin-mini-stat-grid">
                <div><strong>{apartments.length}</strong><span>Apartments</span></div>
                <div><strong>{fullApartments}</strong><span>Full</span></div>
                <div><strong>{emptyApartments}</strong><span>Empty</span></div>
                <div><strong>{apartments.length - fullApartments - emptyApartments}</strong><span>Partial</span></div>
              </div>
            </div>

            {(ev.couple_note || ev.portal_feedback_rating || ev.portal_feedback_comment) && (
              <div className="card card-pad admin-event-panel admin-event-wide-panel admin-couple-message-panel">
                <div className="admin-event-panel-head"><div><span>From the couple</span><h2>Final note & PlannerHouse feedback</h2></div></div>
                <div className="admin-couple-message-grid">
                  <div>
                    <strong>Note for La Dogana</strong>
                    <p>{ev.couple_note || "No final note was added."}</p>
                  </div>
                  <div>
                    <strong>PlannerHouse experience</strong>
                    <div className="admin-feedback-rating">
                      {ev.portal_feedback_rating === "loved" ? "😍 Loved it" : ev.portal_feedback_rating === "good" ? "🙂 It was good" : ev.portal_feedback_rating === "could_be_better" ? "😕 Could be better" : "No rating"}
                    </div>
                    <p>{ev.portal_feedback_comment || "No additional feedback."}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="card card-pad admin-event-panel admin-event-wide-panel">
              <div className="admin-event-panel-head"><div><span>Review workflow</span><h2>Guest list status</h2></div></div>
              <div className="admin-event-status-actions">
                <button className="btn-ghost" disabled={statusBusy || ev.status === "draft"} onClick={() => setStatusAdmin("draft")}>Return to Draft</button>
                <button className="btn-ghost" disabled={statusBusy || ev.status === "submitted"} onClick={() => setStatusAdmin("submitted")}>Mark as Submitted</button>
                <button className="btn" disabled={statusBusy || ev.status === "final"} onClick={() => setStatusAdmin("final")}>Mark as Final</button>
              </div>
              <p className="admin-event-helper">Use <strong>Return to Draft</strong> when the couple needs to make changes. Use <strong>Mark as Final</strong> after the team has reviewed and approved the guest list.</p>
            </div>
          </section>
        )}

        {activeTab === "guests" && (
          <section className="card card-pad admin-event-panel">
            <div className="admin-event-panel-head admin-event-guest-toolbar">
              <div><span>Guest management</span><h2>Guest list</h2></div>
              <div className="admin-event-export-buttons"><button className="btn-ghost" onClick={exportPdf}>Export PDF</button><button className="btn" onClick={exportCsv}>Export CSV</button></div>
            </div>

            <div className="admin-event-filterbar">
              <input className="input" placeholder="Search guest name…" value={guestSearch} onChange={(event) => setGuestSearch(event.target.value)} />
              <div className="admin-event-filter-pills">
                {(["all", "assigned", "unassigned", "allergies", "early"] as GuestFilter[]).map((filter) => (
                  <button key={filter} className={guestFilter === filter ? "active" : ""} onClick={() => setGuestFilter(filter)}>{filter === "early" ? "Early arrivals" : filter[0].toUpperCase() + filter.slice(1)}</button>
                ))}
              </div>
            </div>

            <div className="admin-event-table-wrap">
              <table className="admin-event-table">
                <thead><tr><th>Guest</th><th>Type</th><th>Apartment</th><th>Arrival</th><th>Stay</th><th>Allergies</th><th>Notes</th></tr></thead>
                <tbody>
                  {filteredGuests.length === 0 ? (
                    <tr><td colSpan={7} className="admin-event-empty-row">No guests match this filter.</td></tr>
                  ) : filteredGuests.map((guest) => (
                    <tr key={guest.id}>
                      <td><strong>{guest.first_name} {guest.last_name}</strong></td>
                      <td>{guestTypeLabel(guest)}</td>
                      <td><span className={`admin-table-pill ${guest.apartment_id ? "assigned" : "unassigned"}`}>{guest.apartment_id ? friendlyAptLabel(guest.apartment_id) : "Unassigned"}</span></td>
                      <td>{guest.arrival_mode || "—"}</td>
                      <td>{formatDate(guest.checkin_date)}<br /><small>to {formatDate(guest.checkout_date)}</small>{guest.extra_nights > 0 && <><br /><small>{guest.extra_nights} extra night(s)</small></>}</td>
                      <td>{guest.allergies || "—"}</td>
                      <td>{guest.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === "apartments" && (
          <section className="admin-apartment-card-grid">
            {apartments.map((apartment) => {
              const apartmentGuests = guestsByApartment.get(apartment.apartment_id) ?? [];
              const state = apartment.guests_count === 0 ? "empty" : apartment.guests_count >= apartment.capacity ? "full" : "partial";
              return (
                <article className="card card-pad admin-apartment-card" key={apartment.apartment_id}>
                  <div className="admin-apartment-card-head">
                    <div><span>{apartment.structure} · Floor {apartment.floor}</span><h2>{friendlyAptLabel(apartment.apartment_id)}</h2></div>
                    <span className={`admin-apartment-state ${state}`}>{apartment.guests_count}/{apartment.capacity}</span>
                  </div>
                  <div className="admin-apartment-progress"><div style={{ width: `${Math.min(100, Math.round((apartment.guests_count / Math.max(1, apartment.capacity)) * 100))}%` }} /></div>
                  <div className="admin-apartment-guests">
                    {apartmentGuests.length === 0 ? <p>No guests assigned.</p> : apartmentGuests.map((guest) => <span key={guest.id}>{guest.first_name} {guest.last_name}</span>)}
                  </div>
                </article>
              );
            })}
            <article className="card card-pad admin-apartment-card admin-apartment-unassigned">
              <div className="admin-apartment-card-head"><div><span>Needs attention</span><h2>Unassigned guests</h2></div><span className="admin-apartment-state partial">{unassignedGuests.length}</span></div>
              <div className="admin-apartment-guests">
                {unassignedGuests.length === 0 ? <p>Everyone is assigned.</p> : unassignedGuests.map((guest) => <span key={guest.id}>{guest.first_name} {guest.last_name}</span>)}
              </div>
            </article>
          </section>
        )}

        {activeTab === "settings" && (
          <section className="card card-pad admin-event-panel admin-event-settings-panel">
            <div className="admin-event-panel-head"><div><span>Event settings</span><h2>Edit event and couple welcome page</h2></div></div>
            {settingsMsg && <div className={`admin-event-alert ${settingsMsg.type}`}>{settingsMsg.text}</div>}
            <div className="admin-event-settings-grid">
              <div><label>Event name</label><input className="input" value={settingsName} onChange={(event) => setSettingsName(event.target.value)} /></div>
              <div><label>Start date</label><input className="input" type="date" value={settingsStart} onChange={(event) => setSettingsStart(event.target.value)} /></div>
              <div><label>End date</label><input className="input" type="date" value={settingsEnd} onChange={(event) => setSettingsEnd(event.target.value)} /></div>
              <div className="admin-event-settings-span"><label>Welcome page title</label><input className="input" value={settingsWelcomeTitle} onChange={(event) => setSettingsWelcomeTitle(event.target.value)} /></div>
              <div className="admin-event-settings-span"><label>Welcome message</label><textarea rows={8} value={settingsWelcomeMessage} onChange={(event) => setSettingsWelcomeMessage(event.target.value)} /></div>
              <div className="admin-event-settings-span"><label>Tip message</label><textarea rows={3} value={settingsTip} onChange={(event) => setSettingsTip(event.target.value)} /></div>
              <div className="admin-event-settings-span"><label>Tutorial video URL</label><input className="input" type="url" value={settingsVideo} onChange={(event) => setSettingsVideo(event.target.value)} placeholder="https://…" /></div>
            </div>
            <div className="admin-event-settings-actions"><button className="btn-ghost" onClick={load} disabled={settingsBusy}>Discard changes</button><button className="btn" onClick={saveSettings} disabled={settingsBusy}>{settingsBusy ? "Saving…" : "Save changes"}</button></div>
          </section>
        )}
      </main>
    </>
  );
}
