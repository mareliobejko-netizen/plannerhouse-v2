"use client";

import type { ReactNode } from "react";
import { supabase } from "@/lib/supabaseClient";

const WEBSITE_URL = "https://agriturismodogana.it/";
const INSTAGRAM_URL = "https://www.instagram.com/luciasitalia/";
const FACEBOOK_URL = "https://www.facebook.com/agriturismodogana.it/";

type IconProps = { size?: number };

type PortalTopbarProps = {
  variant?: "guest" | "admin";
  active?: "home" | "account" | "dashboard" | "users" | "photos";
  extraActions?: ReactNode;
};

function IconHome({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3.5 11.1 12 4l8.5 7.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.7 10.4V20h12.6v-9.6M9.5 20v-5.6h5V20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconUser({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="3.4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5.7 20c.7-4 3-6 6.3-6s5.6 2 6.3 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconUsers({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17" cy="9" r="2.3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 20c.6-4 2.6-6 5.5-6s4.9 2 5.5 6M14.5 15c2.7-.2 4.6 1.4 5.3 4.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconPhotos({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="9" cy="9" r="1.6" stroke="currentColor" strokeWidth="1.6" />
      <path d="m5.5 17 4.2-4.2 2.8 2.7 2.2-2.1 3.8 3.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconGrid({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="6" height="6" rx="1.3" stroke="currentColor" strokeWidth="1.8" />
      <rect x="14" y="4" width="6" height="6" rx="1.3" stroke="currentColor" strokeWidth="1.8" />
      <rect x="4" y="14" width="6" height="6" rx="1.3" stroke="currentColor" strokeWidth="1.8" />
      <rect x="14" y="14" width="6" height="6" rx="1.3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function IconGlobe({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 12h18M12 3c2.7 2.7 4.2 5.7 4.2 9S14.7 18.3 12 21c-2.7-2.7-4.2-5.7-4.2-9S9.3 5.7 12 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconInstagram({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17.4" cy="6.7" r="1" fill="currentColor" />
    </svg>
  );
}

function IconFacebook({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14.2 21v-8h2.8l.5-3.2h-3.3V7.7c0-.9.3-1.6 1.7-1.6h1.8V3.2c-.5-.1-1.4-.2-2.6-.2-2.6 0-4.3 1.6-4.3 4.5v2.3H8V13h2.8v8h3.4Z" fill="currentColor" />
    </svg>
  );
}

function IconLogout({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10 5H5.8A1.8 1.8 0 0 0 4 6.8v10.4A1.8 1.8 0 0 0 5.8 19H10M14 8l4 4-4 4M9 12h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function PortalTopbar({ variant = "guest", active, extraActions }: PortalTopbarProps) {
  const isAdmin = variant === "admin";

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <header className={`topbar portal-topbar ${isAdmin ? "portal-topbar-admin" : ""}`}>
      <div className="portal-topbar-inner">
        <button
          type="button"
          className="portal-brand"
          onClick={() => (window.location.href = isAdmin ? "/admin/events" : "/events")}
          aria-label={isAdmin ? "Go to admin dashboard" : "Go to Guest Portal home"}
        >
          <img src="/logo.svg" alt="La Dogana" className="logo" />
          <span className="portal-brand-badge">{isAdmin ? "Admin Portal" : "Guest Portal"}</span>
        </button>

        <nav className="portal-nav" aria-label={isAdmin ? "Admin navigation" : "Guest navigation"}>
          {isAdmin ? (
            <>
              <button className={`portal-nav-item ${active === "dashboard" ? "active" : ""}`} onClick={() => (window.location.href = "/admin/events")} title="Dashboard">
                <IconGrid /><span>Dashboard</span>
              </button>
              <button className={`portal-nav-item ${active === "users" ? "active" : ""}`} onClick={() => (window.location.href = "/admin/users")} title="User management">
                <IconUsers /><span>Users</span>
              </button>
              <button className={`portal-nav-item ${active === "photos" ? "active" : ""}`} onClick={() => (window.location.href = "/admin/media")} title="Apartment photos">
                <IconPhotos /><span>Photos</span>
              </button>
              <button className="portal-nav-item portal-guest-link" onClick={() => (window.location.href = "/events")} title="Guest portal">
                <IconHome /><span>Guest portal</span>
              </button>
            </>
          ) : (
            <>
              <button className={`portal-nav-item ${active === "home" ? "active" : ""}`} onClick={() => (window.location.href = "/events")} title="Home">
                <IconHome /><span>Home</span>
              </button>
              <button className={`portal-nav-item ${active === "account" ? "active" : ""}`} onClick={() => (window.location.href = "/account")} title="Account">
                <IconUser /><span>Account</span>
              </button>
            </>
          )}

          <span className="portal-nav-divider" aria-hidden="true" />

          <div className="portal-socials" aria-label="La Dogana links">
            <a className="portal-social-icon" href={WEBSITE_URL} target="_blank" rel="noreferrer" aria-label="Website" title="Website"><IconGlobe /></a>
            <a className="portal-social-icon" href={INSTAGRAM_URL} target="_blank" rel="noreferrer" aria-label="Instagram" title="Instagram"><IconInstagram /></a>
            <a className="portal-social-icon" href={FACEBOOK_URL} target="_blank" rel="noreferrer" aria-label="Facebook" title="Facebook"><IconFacebook /></a>
          </div>

          {extraActions && <div className="portal-extra-actions">{extraActions}</div>}

          <span className="portal-nav-divider portal-nav-divider-last" aria-hidden="true" />

          <button className="portal-nav-item portal-logout" onClick={logout} title="Logout">
            <IconLogout /><span>Logout</span>
          </button>
        </nav>
      </div>
      <div className="green-line" />
    </header>
  );
}
