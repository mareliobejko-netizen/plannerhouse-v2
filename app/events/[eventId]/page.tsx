"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

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

type PlanKey = "lake0" | "lake1" | "wc";
type Status = "free" | "partial" | "full";
type PlannerStep = "guests" | "assign" | "review";

function statusOf(capacity: number, guests: number): Status {
  if (guests <= 0) return "free";
  if (guests >= capacity) return "full";
  return "partial";
}

async function loadSvg(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load SVG: ${url}`);
  return await res.text();
}

function friendlyAptLabel(aptId: string) {
  if (aptId === "apt_wc") return "Woodcutter’s House";
  return `Apartment ${aptId.replace("apt_", "")}`;
}

function guestLabel(g: GuestRow) {
  const base = `${g.first_name} ${g.last_name}`;
  if (g.guest_type === "child") {
    return `${base} (child${g.child_age != null ? `, ${g.child_age}` : ""})`;
  }
  return `${base} (adult)`;
}

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysIso(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return isoDate(dt);
}

export default function EventPlannerPage() {
  const params = useParams();
  const eventId = params?.eventId as string | undefined;

  const [err, setErr] = useState<string | null>(null);
  const [uiMsg, setUiMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [plannerStep, setPlannerStep] = useState<PlannerStep>("guests");
  const [listFilter, setListFilter] = useState<"all" | "assigned" | "unassigned">("all");

  const [eventStatus, setEventStatus] = useState<"draft" | "submitted" | "final">("draft");
  const statusLabel = eventStatus === "draft" ? "Draft" : eventStatus === "submitted" ? "Submitted" : "Final";
  const locked = eventStatus !== "draft";
  const [submitting, setSubmitting] = useState(false);

  const [occ, setOcc] = useState<OccRow[]>([]);
  const [allGuests, setAllGuests] = useState<GuestRow[]>([]);

  const [activePlan, setActivePlan] = useState<PlanKey>("lake0");
  const [svgs, setSvgs] = useState<Record<PlanKey, string>>({ lake0: "", lake1: "", wc: "" });
  const [zoom, setZoom] = useState(1);

  const [unassigned, setUnassigned] = useState<GuestRow[]>([]);
  const [assignTo, setAssignTo] = useState<Record<string, string>>({});
  const [sidebarErr, setSidebarErr] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<GuestRow[]>([]);

  const [openAptId, setOpenAptId] = useState<string | null>(null);
  const [aptGuests, setAptGuests] = useState<GuestRow[]>([]);
  const [modalErr, setModalErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [photoCache, setPhotoCache] = useState<Record<string, string[]>>({});
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

  const showLightboxPhoto = (index: number) => {
    if (photoUrls.length === 0) return;
    const nextIndex = (index + photoUrls.length) % photoUrls.length;
    setPhotoIndex(nextIndex);
    setLightboxPhoto(photoUrls[nextIndex]);
  };

  const showPreviousLightboxPhoto = () => showLightboxPhoto(photoIndex - 1);
  const showNextLightboxPhoto = () => showLightboxPhoto(photoIndex + 1);
  const [modalGuestSearch, setModalGuestSearch] = useState("");
  const [forgottenGuestOpen, setForgottenGuestOpen] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [guestType, setGuestType] = useState<"adult" | "child">("adult");
  const [childAge, setChildAge] = useState<number | "">("");
  const [arrivalMode, setArrivalMode] = useState<"" | "car" | "transfer">("");
  const [checkinDate, setCheckinDate] = useState<string>("");
  const [checkoutDate, setCheckoutDate] = useState<string>("");
  const [eventStart, setEventStart] = useState<string>("");
  const [eventEnd, setEventEnd] = useState<string>("");
  const [extraNights, setExtraNights] = useState<number>(0);
  const [allergies, setAllergies] = useState("");
  const [notes, setNotess] = useState("");
  const [formErr, setFormErr] = useState<string | null>(null);
  const [formOk, setFormOk] = useState<string | null>(null);

  // Edit an existing guest without changing the apartment assignment.
  const [editingGuest, setEditingGuest] = useState<GuestRow | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [mailStage, setMailStage] = useState<"open" | "closing" | "closed">("open");

  useEffect(() => {
    if (!lightboxPhoto) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        showPreviousLightboxPhoto();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        showNextLightboxPhoto();
      } else if (event.key === "Escape") {
        setLightboxPhoto(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxPhoto, photoIndex, photoUrls]);

  const statusMap = useMemo(() => {
    const m: Record<string, { status: Status; capacity: number; guests: number }> = {};
    for (const r of occ) {
      m[r.apartment_id] = {
        status: statusOf(r.capacity, r.guests_count),
        capacity: r.capacity,
        guests: r.guests_count,
      };
    }
    return m;
  }, [occ]);

  const apartmentOptions = useMemo(() => {
    const sorted = [...occ].sort((a, b) => {
      const s = a.structure.localeCompare(b.structure);
      if (s !== 0) return s;
      const f = a.floor - b.floor;
      if (f !== 0) return f;
      return a.apartment_id.localeCompare(b.apartment_id);
    });

    return sorted.map((r) => {
      const st = statusOf(r.capacity, r.guests_count);
      const label = `${r.structure} • ${friendlyAptLabel(r.apartment_id)} • ${r.guests_count}/${r.capacity}`;
      return { id: r.apartment_id, label, status: st, structure: r.structure, floor: r.floor, capacity: r.capacity, guests: r.guests_count };
    });
  }, [occ]);

  const modalGuestCandidates = useMemo(() => {
    const q = modalGuestSearch.trim().toLowerCase();
    return allGuests
      .filter((g) => g.apartment_id !== openAptId)
      .filter((g) => !q || `${g.first_name} ${g.last_name}`.toLowerCase().includes(q))
      .sort((a, b) => {
        if (a.apartment_id == null && b.apartment_id != null) return -1;
        if (a.apartment_id != null && b.apartment_id == null) return 1;
        return `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`);
      });
  }, [allGuests, modalGuestSearch, openAptId]);

  const totalGuests = allGuests.length;
  const assignedGuests = allGuests.filter((g) => !!g.apartment_id).length;
  const unassignedGuestsCount = totalGuests - assignedGuests;
  const progressPct = totalGuests > 0 ? Math.round((assignedGuests / totalGuests) * 100) : 0;
  const allAssigned = totalGuests > 0 && unassignedGuestsCount === 0;

  const filteredGuestList = useMemo(() => {
    const sorted = [...allGuests].sort((a, b) => {
      const ln = a.last_name.localeCompare(b.last_name);
      if (ln !== 0) return ln;
      return a.first_name.localeCompare(b.first_name);
    });
    if (listFilter === "assigned") return sorted.filter((g) => !!g.apartment_id);
    if (listFilter === "unassigned") return sorted.filter((g) => !g.apartment_id);
    return sorted;
  }, [allGuests, listFilter]);

  const apartmentGroups = useMemo(() => {
    return apartmentOptions.map((apt) => ({
      ...apt,
      guestsList: allGuests.filter((g) => g.apartment_id === apt.id),
    }));
  }, [apartmentOptions, allGuests]);

  const unassignedReview = useMemo(() => allGuests.filter((g) => !g.apartment_id), [allGuests]);
  const openAptInfo = openAptId ? statusMap[openAptId] : null;

  function resetForm() {
    setFirstName("");
    setLastName("");
    setGuestType("adult");
    setChildAge("");
    setArrivalMode("");
    setCheckinDate(eventStart || "");
    setCheckoutDate(eventEnd || "");
    setExtraNights(0);
    setAllergies("");
    setNotess("");
  }

  async function refreshEventStatus() {
    if (!eventId) return;
    const { data, error } = await supabase.from("events").select("status").eq("id", eventId).single();
    if (error) throw new Error(error.message);
    if (data?.status) setEventStatus(data.status);
  }

  async function refreshOccupancy() {
    if (!eventId) return;
    const { data, error } = await supabase
      .from("apartment_occupancy")
      .select("event_id,apartment_id,capacity,guests_count,structure,floor")
      .eq("event_id", eventId);
    if (error) throw new Error(error.message);
    setOcc((data ?? []) as OccRow[]);
  }

  async function loadAllGuests() {
    if (!eventId) return;
    const { data, error } = await supabase
      .from("guests")
      .select("id,event_id,apartment_id,first_name,last_name,guest_type,child_age,arrival_mode,checkin_date,checkout_date,extra_nights,allergies,notes")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    setAllGuests((data ?? []) as GuestRow[]);
  }

  async function loadUnassigned(usingOcc?: OccRow[]) {
    if (!eventId) return;
    const { data, error } = await supabase
      .from("guests")
      .select("id,event_id,apartment_id,first_name,last_name,guest_type,child_age,arrival_mode,checkin_date,checkout_date,extra_nights,allergies,notes")
      .eq("event_id", eventId)
      .is("apartment_id", null)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);

    const rows = (data ?? []) as GuestRow[];
    setUnassigned(rows);

    const occNow = usingOcc ?? occ;
    const firstNotFull = occNow.find((r) => statusOf(r.capacity, r.guests_count) !== "full")?.apartment_id ?? "";

    setAssignTo((prev) => {
      const next = { ...prev };
      for (const g of rows) {
        if (!next[g.id]) next[g.id] = firstNotFull;
      }
      return next;
    });
  }

  async function loadGuestsForApartment(apartmentId: string) {
    if (!eventId) return;
    const { data, error } = await supabase
      .from("guests")
      .select("id,event_id,apartment_id,first_name,last_name,guest_type,child_age,arrival_mode,checkin_date,checkout_date,extra_nights,allergies,notes")
      .eq("event_id", eventId)
      .eq("apartment_id", apartmentId)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    setAptGuests((data ?? []) as GuestRow[]);
  }

  async function loadApartmentPhotos(apartmentId: string) {
    setPhotoIndex(0);
    const cached = photoCache[apartmentId];
    if (cached && cached.length) {
      setPhotoUrls(cached);
      return;
    }

    setPhotoUrls([]);
    const response = await fetch(`/api/photos?apartmentId=${encodeURIComponent(apartmentId)}`, { credentials: "same-origin" });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json?.error || "Unable to load apartment photos");
    const urls: string[] = (json.photos ?? [])
      .map((photo: { url: string }) => photo.url)
      .filter((url: string): url is string => Boolean(url));

    setPhotoCache((prev) => ({ ...prev, [apartmentId]: urls }));
    setPhotoUrls(urls);
    urls.slice(0, 5).forEach((u: string) => {
      const img = new Image();
      img.src = u;
    });
  }

  function refreshPhotoCache(apartmentId: string) {
    setPhotoCache((prev) => {
      const next = { ...prev };
      delete next[apartmentId];
      return next;
    });
  }

  async function submitEvent() {
    if (!eventId) return;
    setSubmitting(true);
    try {
      const { data: u, error: uErr } = await supabase.auth.getUser();
      if (uErr) throw new Error(uErr.message);
      if (!u?.user) throw new Error("Not authenticated. Please log in again.");

      const { error } = await supabase
        .from("events")
        .update({ status: "submitted", submitted_at: new Date().toISOString(), submitted_by: u.user.id })
        .eq("id", eventId)
        .eq("created_by", u.user.id)
        .eq("status", "draft");

      if (error) throw new Error(error.message);

      await refreshEventStatus();
      setUiMsg({ type: "ok", text: "✅ List sent to Lucia and the team." });
    } catch (e: any) {
      setUiMsg({ type: "err", text: `❌ Submission failed: ${e?.message ?? "unknown error"}` });
      throw e;
    } finally {
      setSubmitting(false);
    }
  }

  async function runSearch() {
    if (!eventId) return;
    const q = search.trim();
    setSearchErr(null);
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const { data, error } = await supabase
        .from("guests")
        .select("id,event_id,apartment_id,first_name,last_name,guest_type,child_age,arrival_mode,checkin_date,checkout_date,extra_nights,allergies,notes")
        .eq("event_id", eventId)
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
        .order("last_name", { ascending: true })
        .limit(30);

      if (error) {
        setSearchErr(error.message);
        return;
      }
      setSearchResults((data ?? []) as GuestRow[]);
    } catch (e: any) {
      setSearchErr(e?.message ?? "Search error");
    } finally {
      setSearching(false);
    }
  }

  async function openApartment(apartmentId: string) {
    setModalErr(null);
    setOpenAptId(apartmentId);
    setModalGuestSearch("");
    setForgottenGuestOpen(false);
    setLightboxPhoto(null);
    setCheckinDate(eventStart || "");
    setCheckoutDate(eventEnd || "");
    resetForm();
    try {
      await Promise.all([loadGuestsForApartment(apartmentId), loadApartmentPhotos(apartmentId)]);
    } catch (e: any) {
      setModalErr(e?.message ?? "Error loading data");
    }
  }

  function onSvgClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const id = target.getAttribute("id");
    if (!id || !id.startsWith("apt_")) return;
    openApartment(id);
  }

  async function deleteGuest(guestId: string) {
    if (locked) {
      setModalErr("The list has been confirmed and can no longer be edited.");
      return;
    }
    setModalErr(null);
    setSidebarErr(null);
    setFormErr(null);
    try {
      const { error } = await supabase.from("guests").delete().eq("id", guestId);
      if (error) throw new Error(error.message);
      await refreshOccupancy();
      await Promise.all([loadUnassigned(), loadAllGuests()]);
      if (openAptId) await loadGuestsForApartment(openAptId);
      setFormOk("Guest removed.");
    } catch (e: any) {
      setModalErr(e?.message ?? "Error deleting guest");
    }
  }

  async function setGuestApartment(guestId: string, apartmentId: string | null, fromModal?: boolean) {
    if (locked) {
      const msg = "The list has been confirmed and can no longer be edited.";
      if (fromModal) setModalErr(msg);
      else setSidebarErr(msg);
      return;
    }

    setModalErr(null);
    setSidebarErr(null);
    setFormErr(null);

    if (apartmentId) {
      const st = statusMap[apartmentId]?.status ?? "free";
      if (st === "full") {
        const msg = "This apartment is full.";
        if (fromModal) setModalErr(msg);
        else setSidebarErr(msg);
        return;
      }
    }

    try {
      const { error } = await supabase.from("guests").update({ apartment_id: apartmentId }).eq("id", guestId);
      if (error) throw new Error(error.message);
      await refreshOccupancy();
      await Promise.all([loadUnassigned(), loadAllGuests()]);
      if (openAptId) await loadGuestsForApartment(openAptId);
      if (!fromModal) setFormOk(apartmentId ? "Guest assigned successfully." : "Guest moved back to unassigned.");
    } catch (e: any) {
      const msg = e?.message ?? "Error moving guest";
      if (fromModal) setModalErr(msg);
      else setSidebarErr(msg);
    }
  }

  function startEditGuest(guest: GuestRow) {
    if (locked) {
      setUiMsg({ type: "err", text: "The list has been confirmed and can no longer be edited." });
      return;
    }
    setEditErr(null);
    setEditingGuest({ ...guest });
  }

  function updateEditingGuest<K extends keyof GuestRow>(field: K, value: GuestRow[K]) {
    setEditingGuest((current) => current ? { ...current, [field]: value } : current);
  }

  async function saveGuestChanges() {
    if (!editingGuest) return;
    if (locked) {
      setEditErr("The list has been confirmed and can no longer be edited.");
      return;
    }

    if (!editingGuest.first_name.trim() || !editingGuest.last_name.trim()) {
      setEditErr("First name and last name are required.");
      return;
    }
    if (editingGuest.guest_type === "child" && editingGuest.child_age == null) {
      setEditErr("Enter the child’s age.");
      return;
    }

    setEditSaving(true);
    setEditErr(null);
    try {
      const { error } = await supabase
        .from("guests")
        .update({
          first_name: editingGuest.first_name.trim(),
          last_name: editingGuest.last_name.trim(),
          guest_type: editingGuest.guest_type,
          child_age: editingGuest.guest_type === "child" ? editingGuest.child_age : null,
          arrival_mode: editingGuest.arrival_mode || null,
          checkin_date: editingGuest.checkin_date || null,
          checkout_date: editingGuest.checkout_date || null,
          extra_nights: Number(editingGuest.extra_nights || 0),
          allergies: editingGuest.allergies?.trim() || null,
          notes: editingGuest.notes?.trim() || null,
        })
        .eq("id", editingGuest.id)
        .eq("event_id", editingGuest.event_id);

      if (error) throw new Error(error.message);

      await Promise.all([loadAllGuests(), loadUnassigned()]);
      if (openAptId) await loadGuestsForApartment(openAptId);
      setEditingGuest(null);
      setUiMsg({ type: "ok", text: "Guest details updated successfully." });
    } catch (e: any) {
      setEditErr(e?.message ?? "Error updating guest");
    } finally {
      setEditSaving(false);
    }
  }

  async function addGuest(toUnassigned: boolean) {
    if (locked) {
      if (openAptId) setModalErr("The list has been confirmed and can no longer be edited.");
      else setFormErr("The list has been confirmed and can no longer be edited.");
      return;
    }
    if (!eventId) return;

    setModalErr(null);
    setFormErr(null);
    setFormOk(null);

    if (!firstName.trim() || !lastName.trim()) {
      const msg = "First name and last name are required.";
      if (openAptId) setModalErr(msg); else setFormErr(msg);
      return;
    }
    if (guestType === "child" && (childAge === "" || Number.isNaN(Number(childAge)))) {
      const msg = "Enter the child’s age.";
      if (openAptId) setModalErr(msg); else setFormErr(msg);
      return;
    }

    const aptId = toUnassigned ? null : openAptId;
    if (!toUnassigned && aptId) {
      const st = statusMap[aptId]?.status ?? "free";
      if (st === "full") {
        setModalErr("This apartment is full.");
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        event_id: eventId,
        apartment_id: aptId,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        guest_type: guestType,
        child_age: guestType === "child" ? Number(childAge) : null,
        arrival_mode: arrivalMode ? arrivalMode : null,
        checkin_date: checkinDate ? checkinDate : null,
        checkout_date: checkoutDate ? checkoutDate : null,
        extra_nights: extraNights ?? 0,
        allergies: allergies ? allergies : null,
        notes: notes ? notes : null,
      };

      const { error } = await supabase.from("guests").insert(payload);
      if (error) throw new Error(error.message);

      await refreshOccupancy();
      await Promise.all([loadUnassigned(), loadAllGuests()]);
      if (openAptId) await loadGuestsForApartment(openAptId);
      resetForm();
      if (forgottenGuestOpen) setForgottenGuestOpen(false);
      if (openAptId && !toUnassigned) setModalErr(null);
      else {
        setFormOk(toUnassigned ? "Guest added. You can assign this guest in the next step." : "Guest added.");
      }
    } catch (e: any) {
      const msg = e?.message ?? "Error adding guest";
      if (openAptId) setModalErr(msg); else setFormErr(msg);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        setErr(null);
        setUiMsg(null);

        if (!eventId) {
          setErr("Missing eventId in route.");
          return;
        }

        const { data: u } = await supabase.auth.getUser();
        if (!u?.user) {
          window.location.href = "/login";
          return;
        }

        const { data: occData, error: occErr } = await supabase
          .from("apartment_occupancy")
          .select("event_id,apartment_id,capacity,guests_count,structure,floor")
          .eq("event_id", eventId);
        if (occErr) throw new Error(occErr.message);
        const occRows = (occData ?? []) as OccRow[];
        setOcc(occRows);

        const { data: ev, error: evErr } = await supabase
          .from("events")
          .select("status,start_date,end_date")
          .eq("id", eventId)
          .single();
        if (evErr) throw new Error(evErr.message);
        if (ev?.status) setEventStatus(ev.status);
        const s = (ev?.start_date ?? "") as string;
        const e = (ev?.end_date ?? "") as string;
        setEventStart(s);
        setEventEnd(e);
        setCheckinDate(s || "");
        setCheckoutDate(e || "");

        await Promise.all([loadUnassigned(occRows), loadAllGuests()]);

        if (!svgs.lake0) {
          const [s0, s1, sw] = await Promise.all([
            loadSvg("/plans/lakehouse_0floor.svg"),
            loadSvg("/plans/lakehouse_1floor.svg"),
            loadSvg("/plans/woodcutter_0floor.svg"),
          ]);
          setSvgs({ lake0: s0, lake1: s1, wc: sw });
        }
      } catch (e: any) {
        setErr(e?.message ?? "Unknown error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const svgHtml = useMemo(() => {
    const raw = svgs[activePlan];
    if (!raw) return "";

    const style = `
      <style>
        .apartment { cursor:pointer; transition: fill .15s ease; }
        .apartment.free { fill: rgba(34,197,94,.30); }
        .apartment.partial { fill: rgba(234,179,8,.28); }
        .apartment.full { fill: rgba(239,68,68,.35); cursor:not-allowed; }
        .apartment:hover{ filter: brightness(1.03); }
      </style>
    `;

    let out = raw.replace(/<svg\b([^>]*)>/, (m) => `${m}\n${style}\n`);
    out = out.replace(/id="(apt_[^"]+)"/g, `id="$1" class="apartment free"`);

    for (const [aptId, v] of Object.entries(statusMap)) {
      const re = new RegExp(`id="${aptId}" class="apartment free"`, "g");
      out = out.replace(re, `id="${aptId}" class="apartment ${v.status}"`);
    }
    return out;
  }, [svgs, activePlan, statusMap]);

  return (
    <>
      <div className="topbar">
        <div className="green-line" />
        <div className="topbar-inner">
          <div className="topbar-left">
            <img src="/logo.svg" className="logo" alt="Villa logo" />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <span className={`badge ${eventStatus}`}>Status: {statusLabel}</span>

            <button
              className="btn"
              onClick={() => {
                setMailStage("open");
                setConfirmOpen(true);
              }}
              disabled={submitting || eventStatus !== "draft"}
              title={eventStatus !== "draft" ? "Event already confirmed" : "Confirm list"}
            >
              {submitting ? "Confirming..." : "Confirm list"}
            </button>

            <button className="btn-ghost" onClick={() => (window.location.href = "/events")}>Home Page</button>
            <button className="btn-ghost" onClick={async () => { await supabase.auth.signOut(); window.location.href = "/login"; }}>Logout</button>
          </div>
        </div>
        <div className="green-line" />
      </div>

      <div className="container planner-redesign">
        <div className="planner-page-hero">
          <div>
            <div className="planner-eyebrow">Guest planning made simple</div>
            <div className="h-serif" style={{ fontSize: 38, lineHeight: 1.03, fontWeight: 700 }}>Room Planner</div>
            <div className="muted" style={{ marginTop: 8, maxWidth: 700 }}>
              Add your guests first, then choose the apartments, and finally review everything before sending the final list.
            </div>
          </div>

          <div className="planner-progress-card card card-pad">
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Planning progress</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
              <div className="planner-progress-value">{progressPct}%</div>
              <div className="muted" style={{ fontSize: 12 }}>{assignedGuests}/{totalGuests || 0} assigned</div>
            </div>
            <div className="planner-progress-track"><div style={{ width: `${progressPct}%` }} /></div>
            <div className="planner-progress-mini-grid">
              <div><strong>{totalGuests}</strong><span>Total guests</span></div>
              <div><strong>{assignedGuests}</strong><span>Assigned</span></div>
              <div><strong>{unassignedGuestsCount}</strong><span>Remaining</span></div>
            </div>
          </div>
        </div>

        {err && <div className="card card-pad planner-banner planner-banner-err">{err}</div>}
        {uiMsg && <div className={`card card-pad planner-banner ${uiMsg.type === "ok" ? "planner-banner-ok" : "planner-banner-err"}`}>{uiMsg.text}</div>}
        {locked && <div className="card card-pad planner-banner planner-banner-warn"><b>List confirmed:</b> editing is locked.</div>}

        <div className="planner-stepper card card-pad">
          {([
            ["guests", "Add Guests", "Start by creating your guest list"],
            ["assign", "Assign Apartments", "Choose a room for each guest"],
            ["review", "Review & Submit", "Double-check everything before sending"],
          ] as const).map(([key, title, subtitle], index) => {
            const stepNumber = index + 1;
            const done = (key === "guests" && totalGuests > 0) || (key === "assign" && allAssigned);
            const active = plannerStep === key;
            return (
              <button key={key} className={`planner-step ${active ? "active" : ""}`} onClick={() => setPlannerStep(key)}>
                <span className={`planner-step-bullet ${done ? "done" : ""}`}>{done ? "✓" : stepNumber}</span>
                <span>
                  <strong>{title}</strong>
                  <small>{subtitle}</small>
                </span>
              </button>
            );
          })}
        </div>

        {plannerStep === "guests" && (
          <div className="planner-section-grid">
            <div className="card card-pad planner-add-card">
              <div className="planner-section-kicker">Step 1</div>
              <div className="h-serif planner-section-title">Add your guests</div>
              <p className="planner-section-copy">
                Start by adding everyone who will be staying at La Dogana. You can assign apartments in the next step.
              </p>

              {formErr && <div className="planner-inline-msg err">{formErr}</div>}
              {formOk && <div className="planner-inline-msg ok">{formOk}</div>}

              <div className="planner-form-grid">
                <div>
                  <div className="label">First name</div>
                  <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={saving || locked} />
                </div>
                <div>
                  <div className="label">Last name</div>
                  <input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={saving || locked} />
                </div>
                <div>
                  <div className="label">Type</div>
                  <select value={guestType} onChange={(e) => setGuestType(e.target.value as any)} disabled={saving || locked}>
                    <option value="adult">Adult</option>
                    <option value="child">Child</option>
                  </select>
                </div>
                <div>
                  <div className="label">Age (children only)</div>
                  <input className="input" type="number" min={0} max={17} value={childAge} onChange={(e) => setChildAge(e.target.value === "" ? "" : Number(e.target.value))} disabled={saving || locked || guestType !== "child"} />
                </div>
                <div>
                  <div className="label">Arrival</div>
                  <select value={arrivalMode} onChange={(e) => setArrivalMode(e.target.value as any)} disabled={saving || locked}>
                    <option value="">—</option>
                    <option value="car">Car</option>
                    <option value="transfer">Transfer</option>
                  </select>
                </div>
                <div>
                  <div className="label">Extra nights</div>
                  <input className="input" type="number" min={0} value={extraNights} onChange={(e) => setExtraNights(Number(e.target.value))} disabled={saving || locked} />
                </div>
                <div>
                  <div className="label">Check-in</div>
                  <select value={checkinDate || eventStart} disabled={saving || locked || !eventStart} onChange={(e) => setCheckinDate(e.target.value)}>
                    <option value={eventStart}>{eventStart}</option>
                    <option value={addDaysIso(eventStart, -1)}>{addDaysIso(eventStart, -1)} (one day before)</option>
                  </select>
                </div>
                <div>
                  <div className="label">Check-out</div>
                  <select value={checkoutDate || eventEnd} disabled={saving || locked || !eventEnd} onChange={(e) => setCheckoutDate(e.target.value)}>
                    <option value={eventEnd}>{eventEnd}</option>
                  </select>
                </div>
                <div className="planner-form-span2">
                  <div className="label">Allergies / intolerances</div>
                  <input className="input" value={allergies} onChange={(e) => setAllergies(e.target.value)} disabled={saving || locked} />
                </div>
                <div className="planner-form-span2">
                  <div className="label">Notes</div>
                  <textarea rows={3} value={notes} onChange={(e) => setNotess(e.target.value)} disabled={saving || locked} />
                </div>
              </div>

              <div className="planner-tip-box">
                <span>Tip</span>
                <p>All guests added here will start as unassigned. In the next step, you can place each guest in the apartment you prefer.</p>
              </div>

              <div className="planner-actions-row">
                <button className="btn" onClick={() => addGuest(true)} disabled={saving || locked}>{saving ? "Saving…" : "+ Add guest"}</button>
                <button className="btn-ghost" onClick={() => { setPlannerStep("assign"); setFormErr(null); setFormOk(null); }} disabled={totalGuests === 0}>Continue to apartments →</button>
              </div>
            </div>

            <div className="card card-pad planner-list-card">
              <div className="planner-list-head">
                <div>
                  <div className="planner-section-kicker">Your guest list</div>
                  <div className="h-serif planner-section-title" style={{ fontSize: 28 }}>Guests added</div>
                </div>
                <span className="badge draft">{allGuests.length}</span>
              </div>

              <div className="planner-filter-row">
                <button className={`planner-filter-pill ${listFilter === "all" ? "active" : ""}`} onClick={() => setListFilter("all")}>All</button>
                <button className={`planner-filter-pill ${listFilter === "unassigned" ? "active" : ""}`} onClick={() => setListFilter("unassigned")}>Unassigned</button>
                <button className={`planner-filter-pill ${listFilter === "assigned" ? "active" : ""}`} onClick={() => setListFilter("assigned")}>Assigned</button>
              </div>

              {filteredGuestList.length === 0 ? (
                <div className="planner-empty-card">
                  <div className="h-serif">No guests yet</div>
                  <p>Add your first guest using the form on the left to start building the list.</p>
                </div>
              ) : (
                <div className="planner-guest-list">
                  {filteredGuestList.map((g) => (
                    <div key={g.id} className="planner-guest-item">
                      <div>
                        <div className="planner-guest-name">{g.first_name} {g.last_name}</div>
                        <div className="planner-guest-meta">
                          {g.guest_type === "child" ? `Child${g.child_age != null ? ` • ${g.child_age} years` : ""}` : "Adult"}
                          {g.allergies ? ` • ${g.allergies}` : ""}
                          {g.arrival_mode ? ` • ${g.arrival_mode}` : ""}
                        </div>
                        {g.notes && <div className="planner-guest-note">{g.notes}</div>}
                      </div>

                      <div className="planner-guest-actions">
                        <span className={`planner-status-pill ${g.apartment_id ? "assigned" : "unassigned"}`}>{g.apartment_id ? friendlyAptLabel(g.apartment_id) : "Unassigned"}</span>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          <button className="btn-sm btn-ghost" disabled={locked} onClick={() => startEditGuest(g)}>Edit Guest</button>
                          {g.apartment_id ? (
                            <button className="btn-sm btn-ghost" onClick={() => openApartment(g.apartment_id!)}>Open apartment</button>
                          ) : (
                            <button className="btn-sm btn-ghost" onClick={() => setPlannerStep("assign")}>Assign now</button>
                          )}
                          <button className="btn-sm btn-ghost" disabled={locked} onClick={() => deleteGuest(g.id)}>Delete</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {plannerStep === "assign" && (
          <>
            <div className="planner-assign-banner card card-pad">
              <div>
                <div className="planner-section-kicker">Step 2</div>
                <div className="h-serif planner-section-title" style={{ fontSize: 28 }}>Assign apartments</div>
                <p className="planner-section-copy">Select a guest from the right panel and choose the most suitable apartment from the plan.</p>
              </div>
              <div className="planner-assign-banner-stats">
                <div><strong>{unassignedGuestsCount}</strong><span>Guests still to assign</span></div>
                <div><strong>{apartmentOptions.length}</strong><span>Available apartments</span></div>
              </div>
            </div>

            <div className="grid-main">
              <div className="card card-pad">
                <div className="tabs" style={{ marginBottom: 12 }}>
                  <button className={`tab ${activePlan === "lake0" ? "active" : ""}`} onClick={() => setActivePlan("lake0")}>Lake House — 0 Floor</button>
                  <button className={`tab ${activePlan === "lake1" ? "active" : ""}`} onClick={() => setActivePlan("lake1")}>Lake House — 1st Floor</button>
                  <button className={`tab ${activePlan === "wc" ? "active" : ""}`} onClick={() => setActivePlan("wc")}>Woodcutter</button>
                </div>

                <div className="planner-sub-toolbar">
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <button className="btn-ghost btn-sm" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.1).toFixed(1)))}>−</button>
                    <span className="badge draft">Zoom {Math.round(zoom * 100)}%</span>
                    <button className="btn-ghost btn-sm" onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.1).toFixed(1)))}>+</button>
                    <button className="btn-ghost btn-sm" onClick={() => setZoom(1)}>Reset</button>
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>Tip: click any highlighted apartment to see its photos and current guests.</div>
                </div>

                <div className="svg-box plan-wrap" onClick={onSvgClick}>
                  <div style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }} dangerouslySetInnerHTML={{ __html: svgHtml }} />
                </div>

                <div className="legend">
                  <span><span className="dot" style={{ background: "rgba(34,197,94,.45)" }} /> Available</span>
                  <span><span className="dot" style={{ background: "rgba(234,179,8,.45)" }} /> Partially occupied</span>
                  <span><span className="dot" style={{ background: "rgba(239,68,68,.50)" }} /> Full</span>
                </div>

                <div className="planner-actions-row" style={{ marginTop: 16 }}>
                  <button className="btn-ghost" onClick={() => setPlannerStep("guests")}>← Back to guests</button>
                  <button className="btn" onClick={() => setPlannerStep("review")} disabled={totalGuests === 0}>Continue to review →</button>
                </div>
              </div>

              <aside className="card card-pad">
                <div className="h-serif" style={{ fontSize: 20, fontWeight: 700 }}>Guests to assign</div>
                <div className="muted" style={{ marginTop: 4 }}>Search, locate, and assign quickly</div>

                <div style={{ marginTop: 12 }}>
                  <div className="label">Search</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                    <input className="input" placeholder="First or last name…" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }} />
                    <button className="btn-ghost" onClick={runSearch}>{searching ? "..." : "Search"}</button>
                  </div>
                  {searchErr && <div style={{ color: "#b91c1c", marginTop: 8 }}>{searchErr}</div>}
                </div>

                {searchResults.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div className="label">Results</div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {searchResults.map((g) => (
                        <div key={g.id} className="planner-search-card">
                          <div style={{ fontWeight: 700 }}>{guestLabel(g)}</div>
                          <div className="muted" style={{ marginTop: 3 }}>{g.apartment_id ? `Location: ${friendlyAptLabel(g.apartment_id)}` : "Unassigned"}</div>
                          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                            {g.apartment_id ? (
                              <button className="btn-sm btn-ghost" onClick={() => openApartment(g.apartment_id!)}>Open</button>
                            ) : (
                              <button className="btn-sm btn-ghost" onClick={() => document.getElementById("unassigned-block")?.scrollIntoView({ behavior: "smooth" })}>Go to unassigned guests</button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div id="unassigned-block" style={{ marginTop: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div className="h-serif" style={{ fontSize: 18, fontWeight: 700 }}>Unassigned guests</div>
                    <span className="badge draft">{unassigned.length}</span>
                  </div>

                  {sidebarErr && <div style={{ color: "#b91c1c", marginTop: 8 }}>{sidebarErr}</div>}

                  {unassigned.length === 0 ? (
                    <div className="planner-empty-card" style={{ marginTop: 12 }}>
                      <div className="h-serif">Everything assigned</div>
                      <p>Wonderful — all guests already have an apartment.</p>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                      {unassigned.map((g) => {
                        const selectedApt = assignTo[g.id] ?? "";
                        return (
                          <div key={g.id} className="planner-assign-item">
                            <div style={{ fontWeight: 700 }}>{guestLabel(g)}</div>
                            <div className="planner-assign-controls">
                              <select value={selectedApt} onChange={(e) => setAssignTo((p) => ({ ...p, [g.id]: e.target.value }))} disabled={locked}>
                                <option value="">Select apartment</option>
                                {apartmentOptions.map((o) => (
                                  <option key={o.id} value={o.id}>{o.label} {o.status === "full" ? "• FULL" : ""}</option>
                                ))}
                              </select>

                              <button className="btn" disabled={locked} onClick={() => {
                                if (!selectedApt) {
                                  setSidebarErr("Select an apartment before assigning.");
                                  return;
                                }
                                setGuestApartment(g.id, selectedApt, false);
                              }}>Assign</button>
                            </div>

                            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button className="btn-sm btn-ghost" disabled={locked} onClick={() => deleteGuest(g.id)}>Delete</button>
                              {selectedApt && <button className="btn-sm btn-ghost" onClick={() => openApartment(selectedApt)}>Open apartment</button>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </aside>
            </div>
          </>
        )}

        {plannerStep === "review" && (
          <>
            <div className="planner-review-hero card card-pad">
              <div>
                <div className="planner-section-kicker">Step 3</div>
                <div className="h-serif planner-section-title" style={{ fontSize: 30 }}>Review your guest list</div>
                <p className="planner-section-copy">Double-check every apartment before sending the final list to Lucia and the team.</p>
              </div>
              <div className="planner-review-actions">
                <button className="btn-ghost" onClick={() => setPlannerStep("assign")}>← Back to planner</button>
                <button className="btn" onClick={() => { setMailStage("open"); setConfirmOpen(true); }} disabled={submitting || eventStatus !== "draft" || totalGuests === 0}>{submitting ? "Sending…" : "Submit Guest List"}</button>
              </div>
            </div>

            <div className="planner-review-summary">
              <div className="planner-review-summary-card"><strong>{totalGuests}</strong><span>Total guests</span></div>
              <div className="planner-review-summary-card"><strong>{assignedGuests}</strong><span>Assigned</span></div>
              <div className="planner-review-summary-card"><strong>{unassignedGuestsCount}</strong><span>Still unassigned</span></div>
            </div>

            {!allAssigned && totalGuests > 0 && (
              <div className="card card-pad planner-banner planner-banner-warn">
                Some guests are still unassigned. You can still submit later, but for the best result we recommend assigning everyone first.
              </div>
            )}

            <div className="planner-review-grid">
              {apartmentGroups.map((apt) => (
                <div key={apt.id} className="card card-pad planner-room-card">
                  <div className="planner-room-head">
                    <div>
                      <div className="planner-room-title">{friendlyAptLabel(apt.id)}</div>
                      <div className="planner-room-meta">{apt.structure} • {apt.guests}/{apt.capacity} guests</div>
                    </div>
                    <button className="btn-sm btn-ghost" onClick={() => openApartment(apt.id)}>Open</button>
                  </div>
                  {apt.guestsList.length === 0 ? (
                    <div className="planner-room-empty">No guests assigned yet.</div>
                  ) : (
                    <div className="planner-room-guestlist">
                      {apt.guestsList.map((guest) => (
                        <div key={guest.id} className="planner-room-guestpill">{guest.first_name} {guest.last_name}</div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              <div className="card card-pad planner-room-card planner-room-card-accent">
                <div className="planner-room-head">
                  <div>
                    <div className="planner-room-title">Unassigned guests</div>
                    <div className="planner-room-meta">Needs your attention</div>
                  </div>
                  <span className="badge draft">{unassignedReview.length}</span>
                </div>
                {unassignedReview.length === 0 ? (
                  <div className="planner-room-empty">Great — everyone has already been assigned.</div>
                ) : (
                  <div className="planner-room-guestlist">
                    {unassignedReview.map((guest) => (
                      <div key={guest.id} className="planner-room-guestpill warning">{guest.first_name} {guest.last_name}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {editingGuest && (
          <div className="modal-backdrop guest-edit-backdrop" onClick={() => !editSaving && setEditingGuest(null)}>
            <div className="modal guest-edit-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <div>
                  <div className="planner-section-kicker">Guest details</div>
                  <div className="h-serif" style={{ fontSize: 25, fontWeight: 700, color: "#304030", marginTop: 4 }}>
                    Edit {editingGuest.first_name} {editingGuest.last_name}
                  </div>
                  <div className="muted" style={{ marginTop: 4 }}>
                    Update allergies, arrival details, dates, or personal information. The apartment assignment will not change.
                  </div>
                </div>
                <button className="btn-ghost" disabled={editSaving} onClick={() => setEditingGuest(null)}>Close</button>
              </div>

              <div className="modal-body">
                {editErr && <div className="planner-inline-msg err" style={{ marginTop: 0, marginBottom: 14 }}>{editErr}</div>}

                <div className="guest-edit-form">
                  <div>
                    <div className="label">First name</div>
                    <input className="input" value={editingGuest.first_name} onChange={(e) => updateEditingGuest("first_name", e.target.value)} disabled={editSaving} />
                  </div>
                  <div>
                    <div className="label">Last name</div>
                    <input className="input" value={editingGuest.last_name} onChange={(e) => updateEditingGuest("last_name", e.target.value)} disabled={editSaving} />
                  </div>
                  <div>
                    <div className="label">Type</div>
                    <select value={editingGuest.guest_type} onChange={(e) => {
                      const type = e.target.value as "adult" | "child";
                      setEditingGuest((current) => current ? { ...current, guest_type: type, child_age: type === "adult" ? null : current.child_age } : current);
                    }} disabled={editSaving}>
                      <option value="adult">Adult</option>
                      <option value="child">Child</option>
                    </select>
                  </div>
                  <div>
                    <div className="label">Age (children only)</div>
                    <input className="input" type="number" min={0} max={17} value={editingGuest.child_age ?? ""} onChange={(e) => updateEditingGuest("child_age", e.target.value === "" ? null : Number(e.target.value))} disabled={editSaving || editingGuest.guest_type !== "child"} />
                  </div>
                  <div>
                    <div className="label">Arrival</div>
                    <select value={editingGuest.arrival_mode ?? ""} onChange={(e) => updateEditingGuest("arrival_mode", (e.target.value || null) as GuestRow["arrival_mode"])} disabled={editSaving}>
                      <option value="">—</option>
                      <option value="car">Car</option>
                      <option value="transfer">Transfer</option>
                    </select>
                  </div>
                  <div>
                    <div className="label">Extra nights</div>
                    <input className="input" type="number" min={0} value={editingGuest.extra_nights ?? 0} onChange={(e) => updateEditingGuest("extra_nights", Number(e.target.value))} disabled={editSaving} />
                  </div>
                  <div>
                    <div className="label">Check-in</div>
                    <select value={editingGuest.checkin_date ?? eventStart} onChange={(e) => updateEditingGuest("checkin_date", e.target.value || null)} disabled={editSaving || !eventStart}>
                      <option value={eventStart}>{eventStart}</option>
                      <option value={addDaysIso(eventStart, -1)}>{addDaysIso(eventStart, -1)} (one day before)</option>
                    </select>
                  </div>
                  <div>
                    <div className="label">Check-out</div>
                    <select value={editingGuest.checkout_date ?? eventEnd} onChange={(e) => updateEditingGuest("checkout_date", e.target.value || null)} disabled={editSaving || !eventEnd}>
                      <option value={eventEnd}>{eventEnd}</option>
                    </select>
                  </div>
                  <div className="guest-edit-span2">
                    <div className="label">Allergies / intolerances</div>
                    <input className="input" placeholder="For example: gluten, lactose, nuts…" value={editingGuest.allergies ?? ""} onChange={(e) => updateEditingGuest("allergies", e.target.value || null)} disabled={editSaving} />
                  </div>
                  <div className="guest-edit-span2">
                    <div className="label">Notes</div>
                    <textarea rows={4} placeholder="Add any useful information…" value={editingGuest.notes ?? ""} onChange={(e) => updateEditingGuest("notes", e.target.value || null)} disabled={editSaving} />
                  </div>
                </div>

                <div className="guest-edit-assignment">
                  <span>Current assignment</span>
                  <strong>{editingGuest.apartment_id ? friendlyAptLabel(editingGuest.apartment_id) : "Unassigned"}</strong>
                </div>

                <div className="guest-edit-actions">
                  <button className="btn-ghost" disabled={editSaving} onClick={() => setEditingGuest(null)}>Cancel</button>
                  <button className="btn" disabled={editSaving} onClick={saveGuestChanges}>{editSaving ? "Saving changes…" : "Save Changes"}</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {openAptId && (
          <div className="modal-backdrop" onClick={() => setOpenAptId(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <div>
                  <div className="h-serif" style={{ fontSize: 22, fontWeight: 700 }}>{friendlyAptLabel(openAptId)}</div>
                  <div className="muted" style={{ marginTop: 4 }}>
                    Status: <b>{openAptInfo?.status ?? "free"}</b> • Guests: <b>{openAptInfo?.guests ?? 0}</b> / <b>{openAptInfo?.capacity ?? "?"}</b>
                  </div>
                </div>
                <button className="btn-ghost" onClick={() => setOpenAptId(null)}>Close</button>
              </div>

              <div className="modal-body">
                {modalErr && <div className="card card-pad" style={{ borderColor: "rgba(239,68,68,.35)", color: "#b91c1c", marginBottom: 12, background: "rgba(239,68,68,.06)" }}>{modalErr}</div>}

                <div className="modal-body-grid">
                  <div className="card card-pad" style={{ boxShadow: "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                      <div className="h-serif" style={{ fontSize: 18, fontWeight: 700 }}>Photos</div>
                      <button className="btn-ghost btn-sm" onClick={() => { if (!openAptId) return; refreshPhotoCache(openAptId); loadApartmentPhotos(openAptId); }}>Refresh</button>
                    </div>

                    {photoUrls.length === 0 ? (
                      <div className="muted" style={{ marginTop: 10 }}>No photos uploaded.</div>
                    ) : (
                      <>
                        <button className="photo-hero photo-hero-button" style={{ marginTop: 10 }} onClick={() => showLightboxPhoto(photoIndex)} aria-label="Enlarge apartment photo">
                          <img src={photoUrls[photoIndex]} alt="Apartment photo" />
                          <span className="photo-zoom-hint">↗ Enlarge photo</span>
                        </button>
                        <div className="photo-strip">
                          {photoUrls.slice(0, 5).map((url, idx) => (
                            <div key={url} className={`thumb ${idx === photoIndex ? "active" : ""}`} onClick={() => setPhotoIndex(idx)} role="button" aria-label={`Photo ${idx + 1}`}>
                              <img src={url} alt={`Thumb ${idx + 1}`} />
                            </div>
                          ))}
                        </div>
                        <div className="photo-nav">
                          <button className="btn-ghost btn-sm" onClick={() => setPhotoIndex((i) => Math.max(0, i - 1))} disabled={photoIndex === 0}>←</button>
                          <span className="muted">{photoIndex + 1} / {photoUrls.length}</span>
                          <button className="btn-ghost btn-sm" onClick={() => setPhotoIndex((i) => Math.min(photoUrls.length - 1, i + 1))} disabled={photoIndex >= photoUrls.length - 1}>→</button>
                        </div>
                      </>
                    )}

                    <div style={{ height: 14 }} />
                    <div className="h-serif" style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Guests</div>
                    {aptGuests.length === 0 ? (
                      <div className="muted">No guests assigned.</div>
                    ) : (
                      <div style={{ display: "grid", gap: 10 }}>
                        {aptGuests.map((g) => (
                          <div key={g.id} style={{ border: "1px solid rgba(48,64,48,.12)", borderRadius: 14, padding: 10 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                              <div style={{ fontWeight: 700 }}>{guestLabel(g)}</div>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                                <button className="btn-ghost btn-sm" disabled={locked} onClick={() => startEditGuest(g)}>Edit Guest</button>
                                <button className="btn-ghost btn-sm" disabled={locked} onClick={() => deleteGuest(g.id)}>Delete</button>
                              </div>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, marginTop: 8 }}>
                              <select defaultValue="" disabled={locked} onChange={(e) => { (e.target as any).dataset.sel = e.target.value; }}>
                                <option value="">Reassign to...</option>
                                <option value="__unassign">Unassigned</option>
                                {apartmentOptions.map((o) => (
                                  <option key={o.id} value={o.id}>{o.label} {o.status === "full" ? "• FULL" : ""}</option>
                                ))}
                              </select>
                              <button className="btn" disabled={locked} onClick={(e) => {
                                const sel = (e.currentTarget.parentElement?.querySelector("select") as any)?.dataset?.sel as string | undefined;
                                if (!sel) { setModalErr("Select a destination before moving the guest."); return; }
                                if (sel === "__unassign") setGuestApartment(g.id, null, true);
                                else setGuestApartment(g.id, sel, true);
                              }}>Move Guest</button>
                              <button className="btn-ghost" disabled={locked} onClick={() => setGuestApartment(g.id, null, true)}>⇢ Unassigned</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="card card-pad apartment-assign-panel" style={{ boxShadow: "none" }}>
                    <div className="h-serif" style={{ fontSize: 20, fontWeight: 700 }}>Assign guests to {friendlyAptLabel(openAptId)}</div>
                    <div className="muted" style={{ marginTop: 4 }}>Choose a guest you already added and assign them directly to this apartment.</div>

                    <div className="forgotten-guest-callout">
                      <div>
                        <strong>Forgot someone?</strong>
                        <span>No worries — you can add a new guest here.</span>
                      </div>
                      <button className="btn-ghost btn-sm" disabled={locked} onClick={() => {
                        resetForm();
                        setCheckinDate(eventStart || "");
                        setCheckoutDate(eventEnd || "");
                        setForgottenGuestOpen((v) => !v);
                      }}>+ Add forgotten guest</button>
                    </div>

                    {forgottenGuestOpen && (
                      <div className="forgotten-guest-form">
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                          <div className="h-serif" style={{ fontSize: 17, fontWeight: 700 }}>Add a forgotten guest</div>
                          <button className="btn-ghost btn-sm" onClick={() => setForgottenGuestOpen(false)}>Close</button>
                        </div>
                        <div className="planner-form-grid" style={{ marginTop: 10 }}>
                          <div><div className="label">First name</div><input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={saving || locked} /></div>
                          <div><div className="label">Last name</div><input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={saving || locked} /></div>
                          <div><div className="label">Type</div><select value={guestType} onChange={(e) => setGuestType(e.target.value as "adult" | "child")} disabled={saving || locked}><option value="adult">Adult</option><option value="child">Child</option></select></div>
                          <div><div className="label">Age (children only)</div><input className="input" type="number" min={0} max={17} value={childAge} onChange={(e) => setChildAge(e.target.value === "" ? "" : Number(e.target.value))} disabled={saving || locked || guestType !== "child"} /></div>
                          <div><div className="label">Arrival</div><select value={arrivalMode} onChange={(e) => setArrivalMode(e.target.value as "" | "car" | "transfer")} disabled={saving || locked}><option value="">—</option><option value="car">Car</option><option value="transfer">Transfer</option></select></div>
                          <div><div className="label">Extra nights</div><input className="input" type="number" min={0} value={extraNights} onChange={(e) => setExtraNights(Number(e.target.value))} disabled={saving || locked} /></div>
                          <div><div className="label">Check-in</div><select value={checkinDate || eventStart} disabled={saving || locked || !eventStart} onChange={(e) => setCheckinDate(e.target.value)}><option value={eventStart}>{eventStart}</option><option value={addDaysIso(eventStart, -1)}>{addDaysIso(eventStart, -1)} (one day before)</option></select></div>
                          <div><div className="label">Check-out</div><select value={checkoutDate || eventEnd} disabled={saving || locked || !eventEnd} onChange={(e) => setCheckoutDate(e.target.value)}><option value={eventEnd}>{eventEnd}</option></select></div>
                          <div className="guest-edit-span2"><div className="label">Allergies / intolerances</div><input className="input" value={allergies} onChange={(e) => setAllergies(e.target.value)} disabled={saving || locked} /></div>
                          <div className="guest-edit-span2"><div className="label">Notes</div><textarea value={notes} onChange={(e) => setNotess(e.target.value)} disabled={saving || locked} rows={3} /></div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
                          <button className="btn-ghost" onClick={() => setForgottenGuestOpen(false)} disabled={saving}>Cancel</button>
                          <button className="btn" onClick={() => addGuest(true)} disabled={saving || locked}>{saving ? "Adding…" : "Add to guest list"}</button>
                        </div>
                      </div>
                    )}

                    <div style={{ marginTop: 14 }}>
                      <div className="label">Search guests</div>
                      <input className="input" placeholder="First or last name…" value={modalGuestSearch} onChange={(e) => setModalGuestSearch(e.target.value)} />
                    </div>

                    <div className="apartment-candidate-header">
                      <span>{modalGuestCandidates.length} guest{modalGuestCandidates.length === 1 ? "" : "s"} available</span>
                      <span>Apartment capacity: {openAptInfo?.guests ?? 0}/{openAptInfo?.capacity ?? "?"}</span>
                    </div>

                    {modalGuestCandidates.length === 0 ? (
                      <div className="planner-empty-card" style={{ marginTop: 10 }}>
                        <div className="h-serif">No guests to show</div>
                        <p>{modalGuestSearch ? "Try a different search." : "Everyone is already assigned to this apartment, or your guest list is empty."}</p>
                      </div>
                    ) : (
                      <div className="apartment-candidate-list">
                        {modalGuestCandidates.map((g) => (
                          <div key={g.id} className="apartment-candidate-row">
                            <div className="apartment-candidate-main">
                              <div className="planner-guest-name">{g.first_name} {g.last_name}</div>
                              <div className="planner-guest-meta">
                                {g.guest_type === "child" ? `Child${g.child_age != null ? ` • ${g.child_age} years` : ""}` : "Adult"}
                                {g.apartment_id ? ` • Currently in ${friendlyAptLabel(g.apartment_id)}` : " • Unassigned"}
                              </div>
                            </div>
                            <div className="apartment-candidate-actions">
                              <button className="btn-ghost btn-sm" disabled={locked} onClick={() => startEditGuest(g)}>Edit</button>
                              <button className="btn btn-sm" disabled={locked || openAptInfo?.status === "full"} onClick={() => setGuestApartment(g.id, openAptId, true)}>
                                {g.apartment_id ? "Move here" : "Assign here"}
                              </button>
                              <button className="btn-ghost btn-sm danger-soft" disabled={locked} onClick={() => deleteGuest(g.id)}>Delete</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {lightboxPhoto && (
        <div className="photo-lightbox" role="dialog" aria-modal="true" aria-label="Apartment photo viewer">
          <button className="photo-lightbox-close" onClick={() => setLightboxPhoto(null)}>Close</button>

          {photoUrls.length > 1 && (
            <>
              <button
                className="photo-lightbox-nav photo-lightbox-prev"
                onClick={showPreviousLightboxPhoto}
                aria-label="Previous photo"
              >
                <span aria-hidden>‹</span>
              </button>
              <button
                className="photo-lightbox-nav photo-lightbox-next"
                onClick={showNextLightboxPhoto}
                aria-label="Next photo"
              >
                <span aria-hidden>›</span>
              </button>
            </>
          )}

          <div className="photo-lightbox-stage">
            <img src={lightboxPhoto} alt={`Apartment photo ${photoIndex + 1}`} />
          </div>

          {photoUrls.length > 1 && (
            <div className="photo-lightbox-counter">{photoIndex + 1} / {photoUrls.length}</div>
          )}
        </div>
      )}

      {confirmOpen && (
        <div className="mbox-backdrop" onClick={() => { if (submitting || mailStage !== "open") return; setConfirmOpen(false); }}>
          <div className={`mbox-modal ${mailStage}`} onClick={(e) => e.stopPropagation()}>
            <div className="mbox-scene">
              <div className="mailbox">
                <div className="mailbox-logo"><img src="/logo.svg" alt="logo" /></div>
                <div className="mailbox-flag" aria-hidden />
                <div className="mailbox-door" aria-hidden />
                <div className="mailbox-inner">
                  <div className="letter">
                    <div className="letter-head">
                      <div className="letter-chip">Guests List</div>
                      <div className="letter-seal"><img src="/logo.svg" alt="seal" /></div>
                    </div>
                    <div className="letter-body">Please click the button below when your list is completed and you would like to send it to Lucia and her team.</div>
                    <div className="letter-actions">
                      <button className="btn letter-send" disabled={submitting || mailStage !== "open"} onClick={async () => {
                        try {
                          setMailStage("closing");
                          setTimeout(() => setMailStage("closed"), 520);
                          await submitEvent();
                          setTimeout(() => { setConfirmOpen(false); setMailStage("open"); }, 850);
                        } catch {
                          setMailStage("open");
                        }
                      }}>{submitting ? "Sending…" : "Send to Lucia & team"}</button>
                      <button className="btn-ghost letter-notyet" disabled={submitting || mailStage !== "open"} onClick={() => setConfirmOpen(false)}>Not yet</button>
                    </div>
                    <div className="letter-hint">Once sent, you won’t be able to edit the list.</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="mbox-foot muted">Tap outside to close (only while open).</div>
          </div>
        </div>
      )}
    </>
  );
}
