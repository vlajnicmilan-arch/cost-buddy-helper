import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Capacitor } from "@capacitor/core";

/**
 * Crisp live chat loader.
 *
 * Loads the Crisp widget ONLY on public/landing/marketing routes on the web.
 * - Skipped entirely in Capacitor native builds (Android/iOS app).
 * - Skipped on authenticated app routes (/home, /dashboard, /wallet, ...).
 * - Loaded as "strictly necessary" support tool — no consent gating, per
 *   product decision (live customer support channel).
 *
 * Whitelist approach: only listed public routes get the widget.
 */

const PUBLIC_PATH_PREFIXES = [
  "/privacy-policy",
  "/terms-of-service",
  "/impressum",
  "/help",
  "/unsubscribe",
  "/p/", // public shared project pages
];

const CRISP_WEBSITE_ID = "83888a2d-5927-4961-a7b1-eb91af074a0d";
const CRISP_SCRIPT_ID = "crisp-chat-loader";

const isPublicLandingPath = (pathname: string): boolean => {
  if (pathname === "/" || pathname === "/landing") return true;
  return PUBLIC_PATH_PREFIXES.some((p) =>
    p.endsWith("/") ? pathname.startsWith(p) : pathname === p
  );
};

const loadCrisp = () => {
  if (typeof window === "undefined") return;
  if (document.getElementById(CRISP_SCRIPT_ID)) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).$crisp = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).CRISP_WEBSITE_ID = CRISP_WEBSITE_ID;

  const script = document.createElement("script");
  script.id = CRISP_SCRIPT_ID;
  script.src = "https://client.crisp.chat/l.js";
  script.async = true;
  document.head.appendChild(script);
};

const showCrisp = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (Array.isArray(w.$crisp)) {
    w.$crisp.push(["do", "chat:show"]);
  }
};

const hideCrisp = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (Array.isArray(w.$crisp)) {
    w.$crisp.push(["do", "chat:hide"]);
  }
};

export const CrispChat = () => {
  const location = useLocation();

  useEffect(() => {
    // Never load in native app — they use in-app feedback FAB instead.
    if (Capacitor.isNativePlatform()) return;

    const shouldShow = isPublicLandingPath(location.pathname);

    if (shouldShow) {
      loadCrisp();
      // If already loaded from a previous visit, make sure it's visible.
      showCrisp();
    } else {
      // Hide on app/auth routes if the script was previously injected.
      hideCrisp();
    }
  }, [location.pathname]);

  return null;
};

export default CrispChat;
