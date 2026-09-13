"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { requireAdminOrRedirect } from "@/lib/requireAdmin";
import PortalTopbar from "@/app/components/PortalTopbar";

type Apartment = {
  id: string;
  label: string;
  structure: string;
  floor: number;
  capacity: number;
};

type Photo = {
  publicId: string;
  url: string;
  width?: number | null;
  height?: number | null;
  createdAt?: string | null;
  sortOrder?: number;
  isCover?: boolean;
};

function friendlyFloor(value: number) {
  if (value === 0) return "Ground floor";
  if (value === 1) return "First floor";
  if (value === 2) return "Second floor";
  return `Floor ${value}`;
}

export default function AdminApartmentMediaPage() {
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selected = apartments.find((apartment) => apartment.id === selectedId) ?? null;

  const filteredApartments = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return apartments;
    return apartments.filter((apartment) =>
      `${apartment.label} ${apartment.structure} ${friendlyFloor(apartment.floor)}`.toLowerCase().includes(q)
    );
  }, [apartments, query]);

  useEffect(() => {
    void loadApartments();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    void loadPhotos(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (lightboxIndex == null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightboxIndex(null);
      if (event.key === "ArrowLeft") setLightboxIndex((current) => current == null ? current : (current - 1 + photos.length) % photos.length);
      if (event.key === "ArrowRight") setLightboxIndex((current) => current == null ? current : (current + 1) % photos.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, photos.length]);

  async function loadApartments() {
    setLoading(true);
    setError(null);
    try {
      await requireAdminOrRedirect();
      const { data, error: dbError } = await supabase
        .from("apartments")
        .select("id,label,structure,floor,capacity")
        .order("structure", { ascending: true });
      if (dbError) throw new Error(dbError.message);
      const rows = ((data ?? []) as Apartment[]).sort((a, b) => {
        const structure = a.structure.localeCompare(b.structure);
        if (structure !== 0) return structure;
        if (a.floor !== b.floor) return a.floor - b.floor;
        return a.label.localeCompare(b.label, undefined, { numeric: true });
      });
      setApartments(rows);
      if (rows.length) setSelectedId((current) => current || rows[0].id);
    } catch (err: any) {
      setError(err?.message ?? "Unable to load apartments");
    } finally {
      setLoading(false);
    }
  }

  async function loadPhotos(apartmentId: string) {
    setPhotoLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/photos?apartmentId=${encodeURIComponent(apartmentId)}`, { credentials: "same-origin" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || "Unable to load apartment photos");
      setPhotos((json.photos ?? []) as Photo[]);
    } catch (err: any) {
      setError(err?.message ?? "Unable to load apartment photos");
      setPhotos([]);
    } finally {
      setPhotoLoading(false);
    }
  }

  async function uploadFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!selectedId || !files.length) return;

    setUploading(true);
    setError(null);
    setMessage(null);
    let uploaded = 0;
    try {
      for (const file of files) {
        const form = new FormData();
        form.append("apartmentId", selectedId);
        form.append("file", file);
        const response = await fetch("/api/photos", { method: "POST", body: form, credentials: "same-origin" });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json?.error || `Unable to upload ${file.name}`);
        uploaded += 1;
      }
      await loadPhotos(selectedId);
      setMessage(`${uploaded} photo${uploaded === 1 ? "" : "s"} uploaded successfully.`);
    } catch (err: any) {
      setError(err?.message ?? "Upload failed");
      if (uploaded > 0) await loadPhotos(selectedId);
    } finally {
      setUploading(false);
    }
  }

  function movePhoto(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= photos.length) return;
    setPhotos((current) => {
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
    setMessage("Order changed. Remember to save.");
  }

  function setCover(publicId: string) {
    setPhotos((current) => current.map((photo) => ({ ...photo, isCover: photo.publicId === publicId })));
    setMessage("Cover changed. Remember to save.");
  }

  async function saveOrder() {
    if (!selectedId || !photos.length) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const cover = photos.find((photo) => photo.isCover)?.publicId ?? photos[0].publicId;
      const response = await fetch("/api/photos", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apartmentId: selectedId,
          orderedPublicIds: photos.map((photo) => photo.publicId),
          coverPublicId: cover,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || "Unable to save photo order");
      await loadPhotos(selectedId);
      setMessage("Photo order and cover saved.");
    } catch (err: any) {
      setError(err?.message ?? "Unable to save photo order");
    } finally {
      setSaving(false);
    }
  }

  async function deletePhoto(photo: Photo) {
    if (!selectedId) return;
    if (!window.confirm("Delete this photo permanently? This also removes it from Cloudinary.")) return;
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/photos", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicId: photo.publicId }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || "Unable to delete photo");
      await loadPhotos(selectedId);
      setMessage("Photo deleted.");
    } catch (err: any) {
      setError(err?.message ?? "Unable to delete photo");
    }
  }

  const currentLightbox = lightboxIndex == null ? null : photos[lightboxIndex] ?? null;

  return (
    <>
      <PortalTopbar variant="admin" active="media" />

      <main className="container admin-media-page">
        <section className="admin-media-hero">
          <div>
            <div className="admin-eyebrow">La Dogana administration</div>
            <h1>Apartment photos</h1>
            <p>Upload, remove, reorder and choose the cover photo shown to couples in the Room Planner.</p>
          </div>
          <div className="admin-media-hero-actions">
            <button className="btn" onClick={() => fileInputRef.current?.click()} disabled={!selectedId || uploading}>
              {uploading ? "Uploading…" : "＋ Upload photos"}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={uploadFiles} />
          </div>
        </section>

        {error && <div className="card card-pad admin-alert error">{error}</div>}
        {message && <div className="card card-pad admin-media-success">{message}</div>}

        <div className="admin-media-layout">
          <aside className="card admin-media-sidebar">
            <div className="admin-media-sidebar-head">
              <strong>Apartments</strong>
              <span>{apartments.length}</span>
            </div>
            <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search apartment…" />
            <div className="admin-media-apartment-list">
              {loading ? <div className="muted admin-media-empty">Loading apartments…</div> : filteredApartments.map((apartment) => (
                <button
                  key={apartment.id}
                  className={`admin-media-apartment ${selectedId === apartment.id ? "active" : ""}`}
                  onClick={() => setSelectedId(apartment.id)}
                >
                  <div>
                    <strong>{apartment.label}</strong>
                    <span>{apartment.structure}</span>
                  </div>
                  <small>{friendlyFloor(apartment.floor)} · {apartment.capacity} guests</small>
                </button>
              ))}
            </div>
          </aside>

          <section className="card admin-media-main">
            {!selected ? (
              <div className="admin-media-empty-state"><strong>Select an apartment</strong><span>Choose an apartment from the list to manage its photos.</span></div>
            ) : (
              <>
                <div className="admin-media-main-head">
                  <div>
                    <div className="admin-eyebrow">{selected.structure} · {friendlyFloor(selected.floor)}</div>
                    <h2>{selected.label}</h2>
                    <p>{photos.length} photo{photos.length === 1 ? "" : "s"} · capacity {selected.capacity}</p>
                  </div>
                  <div className="admin-media-main-actions">
                    <button className="btn-ghost" onClick={() => void loadPhotos(selected.id)} disabled={photoLoading}>Refresh</button>
                    <button className="btn" onClick={saveOrder} disabled={!photos.length || saving}>{saving ? "Saving…" : "Save order & cover"}</button>
                  </div>
                </div>

                <div className="admin-media-help">
                  <strong>Tip</strong>
                  <span>The cover photo appears first in the guest gallery. Use the arrows to change the order, then save.</span>
                </div>

                {photoLoading ? (
                  <div className="admin-media-empty-state"><strong>Loading photos…</strong></div>
                ) : photos.length === 0 ? (
                  <div className="admin-media-empty-state upload">
                    <div className="admin-media-upload-icon">＋</div>
                    <strong>No photos yet</strong>
                    <span>Add the first photos for this apartment.</span>
                    <button className="btn" onClick={() => fileInputRef.current?.click()}>Upload photos</button>
                  </div>
                ) : (
                  <div className="admin-media-grid">
                    {photos.map((photo, index) => (
                      <article key={photo.publicId} className={`admin-media-photo-card ${photo.isCover ? "cover" : ""}`}>
                        <button className="admin-media-photo-image" onClick={() => setLightboxIndex(index)} aria-label={`Open photo ${index + 1}`}>
                          <img src={photo.url} alt={`${selected.label} photo ${index + 1}`} />
                          <span className="admin-media-photo-number">{index + 1}</span>
                          {photo.isCover && <span className="admin-media-cover-badge">Cover</span>}
                        </button>
                        <div className="admin-media-photo-controls">
                          <div className="admin-media-order-buttons">
                            <button className="btn-ghost btn-sm" onClick={() => movePhoto(index, -1)} disabled={index === 0}>←</button>
                            <button className="btn-ghost btn-sm" onClick={() => movePhoto(index, 1)} disabled={index === photos.length - 1}>→</button>
                          </div>
                          <button className="btn-ghost btn-sm" onClick={() => setCover(photo.publicId)} disabled={photo.isCover}>{photo.isCover ? "Cover" : "Set cover"}</button>
                          <button className="btn-ghost btn-sm admin-danger-button" onClick={() => void deletePhoto(photo)}>Delete</button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </main>

      {currentLightbox && lightboxIndex != null && (
        <div className="admin-media-lightbox" role="dialog" aria-modal="true" onClick={() => setLightboxIndex(null)}>
          <button className="admin-media-lightbox-close" onClick={() => setLightboxIndex(null)} aria-label="Close">×</button>
          <button className="admin-media-lightbox-nav prev" onClick={(event) => { event.stopPropagation(); setLightboxIndex((lightboxIndex - 1 + photos.length) % photos.length); }} aria-label="Previous">‹</button>
          <img src={currentLightbox.url} alt={`${selected?.label ?? "Apartment"} enlarged`} onClick={(event) => event.stopPropagation()} />
          <button className="admin-media-lightbox-nav next" onClick={(event) => { event.stopPropagation(); setLightboxIndex((lightboxIndex + 1) % photos.length); }} aria-label="Next">›</button>
          <div className="admin-media-lightbox-count">{lightboxIndex + 1} / {photos.length}</div>
        </div>
      )}
    </>
  );
}
