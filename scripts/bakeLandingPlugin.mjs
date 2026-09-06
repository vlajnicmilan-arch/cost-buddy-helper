/**
 * Build-time prerender ("baking") of the two public sales pages.
 *
 *   /          -> dist/index.html          (CentarLanding, hr)
 *   /projekti  -> dist/projekti/index.html (ProjektiLanding, hr)
 *
 * Both pages already ship their body as plain HTML files that the React
 * component injects with `dangerouslySetInnerHTML`, so no SSR and no headless
 * browser is needed: the very same markup is written into `#root` at build
 * time. React still mounts with `createRoot` and replaces it — the markup is
 * identical, so the swap is invisible.
 *
 * HARD RULE: these files are produced ONLY into `dist/` during the build.
 * Nothing is ever written into `public/` — a hand-placed file there would
 * freeze and shadow the component (exactly what happened with the privacy
 * policy).
 */
import fs from 'node:fs';
import path from 'node:path';

const readSrc = (p) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');

/** Google Fonts used by CentarLanding — non-blocking, font-display: swap. */
const CENTAR_FONTS = `    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" media="print" onload="this.media='all'" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Condensed:wght@600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
    <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Condensed:wght@600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap"></noscript>`;

/**
 * Two jobs, inline, before any bundle runs:
 *  1. `dist/index.html` is ALSO the SPA fallback for every unknown path
 *     (/auth, /dashboard, …). There the baked landing markup must never be
 *     shown — it is dropped before first paint, restoring today's behaviour.
 *  2. On "/" itself, keep the baked first paint on the visitor's stored theme.
 */
/**
 * The condition itself is NEVER re-written here: it is lifted verbatim out of
 * `src/lib/fastLanding.js` (the same module `src/main.tsx` imports), with only
 * the `export ` keywords stripped so it can run inside an inline <script>.
 */
export const FAST_LANDING_START = '/* FAST_LANDING:START */';
export const FAST_LANDING_END = '/* FAST_LANDING:END */';

export const extractFastLandingSource = (moduleSource) => {
  const start = moduleSource.indexOf(FAST_LANDING_START);
  const end = moduleSource.indexOf(FAST_LANDING_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error('bake-public-landing: FAST_LANDING region not found in src/lib/fastLanding.js');
  }
  return moduleSource
    .slice(start + FAST_LANDING_START.length, end)
    .replace(/^\s*export\s+/gm, '')
    .trim();
};

const DROP_BAKED = `var r=document.getElementById('root');if(r)r.innerHTML='';document.body.classList.remove('centar-landing-body');var m=document.querySelector('meta[name="landing-render"]');if(m)m.setAttribute('content','spa');`;

/**
 * Dropping the baked markup is bound to ONE case only: `keep === false`.
 * A failing `localStorage` read (private mode, embedded browsers with storage
 * blocked — 94% of our traffic arrives through the Facebook in-app browser)
 * must never wipe the page; the baked default theme simply stays.
 */
export const buildHomeBoot = (fastLandingSource) =>
  `<script>(function(){var keep=false;try{${fastLandingSource}\nkeep=isFastLanding();}catch(e){keep=false;}if(!keep){try{${DROP_BAKED}}catch(e3){}return;}try{var t=localStorage.getItem('centar-theme');if(t!=='light'&&t!=='dark')t='dark';var el=document.querySelector('.centar-landing');if(el)el.setAttribute('data-theme',t);document.body.setAttribute('data-centar-theme',t);}catch(e2){}})();</script>`;

/**
 * The `.rise` reveal, and nothing else. `CentarLanding.css` starts every
 * `.rise` block at `opacity:0`; without this the whole page below the first
 * screen stays invisible until the bundle mounts. The React observer in
 * `CentarLanding.tsx` re-attaches later — `classList.add('in')` on an element
 * that already has it is a no-op, so there is no second reveal and no flicker.
 *
 * On SPA-fallback paths `HOME_BOOT` has already emptied `#root`, so the query
 * matches nothing and this does exactly nothing (and never touches network).
 */
export const RISE_BOOT = `<script>(function(){function all(){var n=document.querySelectorAll('.centar-landing .rise');for(var i=0;i<n.length;i++)n[i].classList.add('in');}try{var els=document.querySelectorAll('.centar-landing .rise');if(!els.length)return;var reduce=false;try{reduce=window.matchMedia('(prefers-reduced-motion:reduce)').matches;}catch(e1){}if(reduce||typeof IntersectionObserver==='undefined'){all();return;}var io=new IntersectionObserver(function(entries){for(var j=0;j<entries.length;j++){if(entries[j].isIntersecting){entries[j].target.classList.add('in');io.unobserve(entries[j].target);}}},{threshold:0.12,rootMargin:'0px 0px -40px 0px'});for(var k=0;k<els.length;k++)io.observe(els[k]);}catch(e2){try{all();}catch(e3){}}})();</script>`;


const escapeAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/** Replace a `<meta name|property="x" content="...">` value in the head. */
/** Every setter below MUST hit — a silent no-op would ship a wrong <head>. */
const replaceOrThrow = (html, re, replacement, what) => {
  if (!re.test(html)) throw new Error(`bake-public-landing: ${what} not found in template`);
  return html.replace(re, replacement);
};

const setMeta = (html, attr, name, value) =>
  replaceOrThrow(
    html,
    new RegExp(`(<meta\\s+${attr}="${name}"\\s+content=")[^"]*(")`, 'i'),
    `$1${escapeAttr(value)}$2`,
    `meta ${attr}="${name}"`,
  );

const setTitle = (html, value) =>
  replaceOrThrow(html, /<title>[\s\S]*?<\/title>/i, `<title>${value}</title>`, '<title>');

const setCanonical = (html, url) =>
  replaceOrThrow(html, /(<link\s+rel="canonical"\s+href=")[^"]*(")/i, `$1${url}$2`, 'canonical link');

const setJsonLd = (html, data) =>
  replaceOrThrow(
    html,
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/i,
    `<script type="application/ld+json">\n${JSON.stringify(data, null, 6)}\n    </script>`,
    'JSON-LD block',
  );

/** Inline <script> blocks in the page bodies never ran under React
 * (`dangerouslySetInnerHTML` does not execute them). Baked into the document
 * they WOULD run — on every SPA-fallback path too. Strip them. */
export const stripScripts = (html) => html.replace(/<script\b[\s\S]*?<\/script>/gi, '');

const injectHead = (html, extra) => html.replace('</head>', `${extra}\n  </head>`);

const setRoot = (html, inner) => {
  if (!html.includes('<div id="root"></div>'))
    throw new Error('bake-public-landing: empty <div id="root"></div> not found (already baked?)');
  return html.replace('<div id="root"></div>', `<div id="root">${inner}</div>`);
};

const addBodyClass = (html, cls) =>
  html.replace(/<body(\s[^>]*)?>/i, (m, attrs = '') =>
    /class="/.test(attrs || '')
      ? m.replace(/class="([^"]*)"/, `class="$1 ${cls}"`)
      : `<body${attrs || ''} class="${cls}">`,
  );

const marker = (routePath) =>
  `    <meta name="landing-render" content="baked" data-path="${routePath}">`;

export function bakeLandingPlugin() {
  /** originalFileName -> emitted asset path (hashed) */
  const assetMap = new Map();

  return {
    name: 'bake-public-landing',
    apply: 'build',
    enforce: 'post',

    generateBundle(_options, bundle) {
      for (const [fileName, info] of Object.entries(bundle)) {
        const originals = info.originalFileNames ?? (info.originalFileName ? [info.originalFileName] : []);
        for (const o of originals) assetMap.set(o.replace(/\\/g, '/'), `/${fileName}`);
      }
    },

    writeBundle(options) {
      const outDir = options.dir ?? path.resolve(process.cwd(), 'dist');
      const templatePath = path.join(outDir, 'index.html');
      if (!fs.existsSync(templatePath)) return;
      const template = fs.readFileSync(templatePath, 'utf8');

      // Idempotency guard: a second pass over a non-clean `dist/` would read an
      // already-baked index.html as its template — `#root` is no longer empty
      // and /projekti would inherit the home page body. Fail loudly instead.
      if (template.includes('name="landing-render"') || !template.includes('<div id="root"></div>')) {
        throw new Error(
          'bake-public-landing: dist/index.html is already baked. Clean dist/ before rebuilding.',
        );
      }

      const fastLandingSource = extractFastLandingSource(readSrc('src/lib/fastLanding.js'));
      const homeBoot = buildHomeBoot(fastLandingSource);

      /* ---------------- / — CentarLanding (hr) ---------------- */
      // CentarLanding.css is part of the entry stylesheet (already a blocking
      // <link> in index.html), so the baked first screen is styled without any
      // extra inline CSS.
      const centarBody = stripScripts(readSrc('src/pages/CentarLanding.body.html'));
      let home = template;
      home = injectHead(home, `${marker('/')}\n${CENTAR_FONTS}`);
      home = addBodyClass(home, 'centar-landing-body');
      home = setRoot(
        home,
        `<div class="centar-landing" data-theme="dark"><div>${centarBody}</div></div>${homeBoot}${RISE_BOOT}`,
      );
      fs.writeFileSync(templatePath, home);

      /* ------------- /projekti — ProjektiLanding (hr) ------------- */
      let projektiBody = stripScripts(readSrc('src/pages/ProjektiLanding.body.html'));
      const images = {
        __ODLUKA__: 'src/assets/landing/odluka.png',
        __SEKCIJE__: 'src/assets/landing/sekcije.png',
        __PROJEKT__: 'src/assets/landing/projekt-kartica.png',
        __BUDZET__: 'src/assets/landing/budzet.png',
        __DNEVNIK__: 'src/assets/landing/dnevnik.png',
        __TROSAK__: 'src/assets/landing/trosak.png',
      };
      for (const [token, source] of Object.entries(images)) {
        const resolved = assetMap.get(source);
        if (!resolved) throw new Error(`bake-public-landing: asset not found in bundle: ${source}`);
        projektiBody = projektiBody.replace(token, resolved);
      }

      // ProjektiLanding.css ships as a lazy route chunk, so the baked page
      // inlines it — otherwise the first screen paints unstyled.
      const cssFile = fs
        .readdirSync(path.join(outDir, 'assets'))
        .find((f) => /^ProjektiLanding-.*\.css$/.test(f));
      if (!cssFile) throw new Error('bake-public-landing: ProjektiLanding css chunk not found');
      const projektiCss = fs.readFileSync(path.join(outDir, 'assets', cssFile), 'utf8');

      const accent = (readSrc('src/lib/moduleColors.ts').match(/projects:\s*'([^']+)'/) || [])[1];
      if (!accent) throw new Error('bake-public-landing: MODULE_HSL.projects not found');

      const title = 'Vođenje projekata — dogovori, izmjene i troškovi | Centar';
      const description =
        'Vodite više gradilišta s jednog mjesta: računi, troškovi, budžet, dogovori i izmjene ostaju uz pravi projekt.';
      const url = 'https://vmbalance.com/projekti';

      let projekti = template;
      projekti = setTitle(projekti, title);
      projekti = setMeta(projekti, 'name', 'description', description);
      projekti = setMeta(projekti, 'property', 'og:title', title);
      projekti = setMeta(projekti, 'property', 'og:description', description);
      projekti = setMeta(projekti, 'property', 'og:url', url);
      projekti = setMeta(projekti, 'name', 'twitter:title', title);
      projekti = setMeta(projekti, 'name', 'twitter:description', description);
      projekti = setCanonical(projekti, url);
      projekti = setJsonLd(projekti, {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: title,
        description,
        url,
        isPartOf: {
          '@type': 'WebSite',
          name: 'Centar',
          url: 'https://vmbalance.com/',
        },
      });
      projekti = injectHead(
        projekti,
        `${marker('/projekti')}\n    <style>${projektiCss}</style>`,
      );
      projekti = setRoot(
        projekti,
        `<div class="projekti-landing" lang="hr" style="--module-accent:${accent}">${projektiBody}</div>`,
      );

      const projektiDir = path.join(outDir, 'projekti');
      fs.mkdirSync(projektiDir, { recursive: true });
      fs.writeFileSync(path.join(projektiDir, 'index.html'), projekti);
    },
  };
}
