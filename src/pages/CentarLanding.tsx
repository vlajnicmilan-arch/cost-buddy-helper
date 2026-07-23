import { useEffect, useRef, useState, useCallback } from "react";
import bodyHtml from "./CentarLanding.body.html?raw";
import "./CentarLanding.css";

/**
 * CentarLanding — statički landing, s runtime nadogradnjama:
 *   1. Lightbox za screenshote (klik/tap na sliku → fullscreen overlay).
 *   2. Prebacivanje svjetla/tamna tema (localStorage: centar-theme).
 *
 * Sadržaj markupa (body HTML) ostaje DOSLOVAN — svi tekstovi u
 * CentarLanding.body.html. Toolbar (tema + jezik) renderira React
 * iznad `dangerouslySetInnerHTML` sadržaja, pa ne kontaminira izvor.
 */
type Theme = "dark" | "light";
const THEME_KEY = "centar-theme";

function readInitialTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    /* noop */
  }
  return "dark";
}

export default function CentarLanding() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  // Persist + apply theme to <body> too (background flash prevention).
  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* noop */
    }
    document.body.setAttribute("data-centar-theme", theme);
    return () => {
      document.body.removeAttribute("data-centar-theme");
    };
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  useEffect(() => {
    document.body.classList.add("centar-landing-body");

    const fontLinks: HTMLLinkElement[] = [];
    const addLink = (attrs: Record<string, string>) => {
      const l = document.createElement("link");
      Object.entries(attrs).forEach(([k, v]) => l.setAttribute(k, v));
      document.head.appendChild(l);
      fontLinks.push(l);
    };
    addLink({ rel: "preconnect", href: "https://fonts.googleapis.com" });
    addLink({
      rel: "preconnect",
      href: "https://fonts.gstatic.com",
      crossorigin: "",
    });
    addLink({
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Condensed:wght@600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap",
    });

    return () => {
      document.body.classList.remove("centar-landing-body");
      fontLinks.forEach((l) => l.remove());
    };
  }, []);

  // Rise animation + APK resolver (body-scoped).
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    root.querySelectorAll(".rise").forEach((el) => io.observe(el));

    const FALLBACK =
      "https://fzalxjretvtvokiotvkf.supabase.co/storage/v1/object/public/public-assets/releases/version.json";
    let apkUrl: string | null = null;

    const resolveApkUrl = (): Promise<string | null> =>
      fetch("/version.json", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .catch(() =>
          fetch(FALLBACK, { cache: "no-store" }).then((r) => r.json())
        )
        .then((j: { apkUrl?: string } | null) =>
          j && j.apkUrl ? j.apkUrl : null
        );

    resolveApkUrl()
      .then((url) => {
        if (!url) return;
        apkUrl = url;
        root.querySelectorAll<HTMLAnchorElement>("a.js-apk").forEach((a) => {
          a.setAttribute("href", url);
        });
      })
      .catch(() => {
        /* fallback klik handler ispod */
      });

    const clickHandlers: Array<{
      el: HTMLAnchorElement;
      fn: (e: MouseEvent) => void;
    }> = [];
    root.querySelectorAll<HTMLAnchorElement>("a.js-apk").forEach((a) => {
      const fn = (e: MouseEvent) => {
        e.preventDefault();
        if (apkUrl) {
          window.open(apkUrl, "_blank", "noopener,noreferrer");
        } else {
          resolveApkUrl().then((url) => {
            if (url) window.open(url, "_blank", "noopener,noreferrer");
          });
        }
      };
      a.addEventListener("click", fn);
      clickHandlers.push({ el: a, fn });
    });

    return () => {
      io.disconnect();
      clickHandlers.forEach(({ el, fn }) => el.removeEventListener("click", fn));
    };
  }, []);

  // Lightbox — event delegation na kontejneru; support Esc, klik na backdrop,
  // browser back gesta (pushState + popstate).
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    let overlay: HTMLDivElement | null = null;
    let pushedState = false;
    const HISTORY_TAG = "__centarLightbox";

    const closeOverlay = (fromPopState = false) => {
      if (!overlay) return;
      overlay.remove();
      overlay = null;
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
      if (pushedState && !fromPopState) {
        pushedState = false;
        try {
          history.back();
        } catch {
          /* noop */
        }
      } else {
        pushedState = false;
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeOverlay();
    };

    const onPop = (e: PopStateEvent) => {
      if (overlay) {
        pushedState = false;
        closeOverlay(true);
      }
    };

    const openLightbox = (img: HTMLImageElement) => {
      if (overlay) return;
      overlay = document.createElement("div");
      overlay.className = "centar-lightbox";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", img.alt || "screenshot");

      const inner = document.createElement("div");
      inner.className = "centar-lightbox-inner";

      const big = document.createElement("img");
      big.src = img.currentSrc || img.src;
      big.alt = img.alt || "";
      big.className = "centar-lightbox-img";

      const close = document.createElement("button");
      close.type = "button";
      close.className = "centar-lightbox-close";
      close.setAttribute("aria-label", "Close");
      close.innerHTML =
        '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';
      close.addEventListener("click", (ev) => {
        ev.stopPropagation();
        closeOverlay();
      });

      overlay.addEventListener("click", (ev) => {
        if (ev.target === overlay) closeOverlay();
      });

      inner.appendChild(big);
      overlay.appendChild(inner);
      overlay.appendChild(close);
      document.body.appendChild(overlay);
      document.body.style.overflow = "hidden";
      document.addEventListener("keydown", onKey);

      // pushState pattern — mobilna back gesta zatvara lightbox umjesto navigacije.
      try {
        history.pushState({ [HISTORY_TAG]: true }, "");
        pushedState = true;
      } catch {
        pushedState = false;
      }
    };

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const img = target.closest<HTMLImageElement>(".shot-img");
      if (!img) return;
      e.preventDefault();
      openLightbox(img);
    };

    root.addEventListener("click", onClick);
    window.addEventListener("popstate", onPop);

    return () => {
      root.removeEventListener("click", onClick);
      window.removeEventListener("popstate", onPop);
      if (overlay) {
        overlay.remove();
        document.body.style.overflow = "";
      }
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="centar-landing"
      data-theme={theme}
    >
      <div className="centar-toolbar" role="toolbar" aria-label="Landing controls">
        <button
          type="button"
          className="centar-toolbar-btn"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Prebaci na svijetlu temu" : "Prebaci na tamnu temu"}
          title={theme === "dark" ? "Svijetla tema" : "Tamna tema"}
        >
          {theme === "dark" ? (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
      </div>
      <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
    </div>
  );
}
