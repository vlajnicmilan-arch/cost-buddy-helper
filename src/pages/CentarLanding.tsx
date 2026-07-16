import { useEffect, useRef } from "react";
import bodyHtml from "./CentarLanding.body.html?raw";
import "./CentarLanding.css";

/**
 * CentarLanding — statički landing 1:1 iz public/centar/index.html.
 *
 * Sadržaj (markup + inline scripts) je preuzet DOSLOVNO iz izvorne datoteke
 * i ubačen kroz dangerouslySetInnerHTML kako bi svaka razlika u prijevodu
 * na JSX bila eliminirana. CSS je scope-an pod .centar-landing (vidi CSS
 * datoteku) da ne kontaminira ostatak aplikacije prilikom klijentske
 * navigacije na /app.
 *
 * Auth guard (redirect prijavljenog korisnika na /app) rješava se u dva
 * sloja:
 *   1. main.tsx (fast-path): ako postoji sb-*-auth-token, ne mountira
 *      landing uopće nego App tree.
 *   2. App.tsx RootRoute: ako je user autentificiran, <Navigate to="/app" />
 *      prije nego se ova komponenta renderira.
 * Zato ovdje nema dodatne guard logike koja bi uzrokovala treperenje.
 */
export default function CentarLanding() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // 1. Boja pozadine cijelog viewporta = boja landinga, da nema bijelog
    //    bljeska iznad/ispod wrappera prije nego CSS izračuna visinu.
    document.body.classList.add("centar-landing-body");

    // 2. IBM Plex fontovi (kao u originalnom /centar/index.html <head>).
    //    Ubacuju se u document.head samo dok je landing mountiran, da ne
    //    kontaminiraju /app rute.
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

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    // 2. IntersectionObserver za .rise (kopirano 1:1 iz originalnog <script>).
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

    // 3. APK download resolver (kopirano 1:1 iz originalnog <script>).
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

  return (
    <div
      ref={containerRef}
      className="centar-landing"
      dangerouslySetInnerHTML={{ __html: bodyHtml }}
    />
  );
}
