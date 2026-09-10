// Minimalni Google Drive klijent — samo fetch, bez Google SDK-a.
// Koristi ga backup-weekly za slanje tjedne kopije na vlasnikov Drive.
//
// Tajne (Cloud Secrets): GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN
// Scope: https://www.googleapis.com/auth/drive.file

export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const DRIVE_API = "https://www.googleapis.com/drive/v3";
export const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
export const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
/** Korijenska mapa na Driveu. */
export const DRIVE_ROOT_FOLDER_NAME = "Centar kopije";
/** Koliko datumskih mapa ostaje na Driveu. */
export const DRIVE_KEEP_FOLDERS = 8;
/** Ključ u `app_settings` gdje pamtimo id korijenske mape. */
export const DRIVE_FOLDER_SETTING_KEY = "gdrive_backup_folder_id";

export type DriveFile = { id: string; name: string; size: number };
export type DriveTarget = { name: string; size: number; path: string };

function envVar(name: string): string {
  const deno = (globalThis as unknown as { Deno?: { env: { get(k: string): string | undefined } } }).Deno;
  const fromDeno = deno?.env?.get(name);
  const fromNode = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process
    ?.env?.[name];
  const v = fromDeno ?? fromNode;
  if (!v) throw new Error(`Nedostaje tajna ${name}`);
  return v;
}

// ---------------------------------------------------------------------------
// Čiste odluke (testabilne bez mreže)
// ---------------------------------------------------------------------------

/** Preskoči datoteke koje u ciljanoj mapi već postoje s istim imenom i veličinom. */
export function planDriveUploads(
  existing: readonly DriveFile[],
  wanted: readonly DriveTarget[],
): { upload: DriveTarget[]; skipped: DriveTarget[] } {
  const index = new Map(existing.map((f) => [f.name, Number(f.size) || 0]));
  const upload: DriveTarget[] = [];
  const skipped: DriveTarget[] = [];
  for (const w of wanted) {
    if (index.get(w.name) === (Number(w.size) || 0)) skipped.push(w);
    else upload.push(w);
  }
  return { upload, skipped };
}

/** Datumske mape (YYYY-MM-DD) koje idu u smeće — sve osim zadnjih `keep`. */
export function foldersToTrash(
  folders: readonly { id: string; name: string }[],
  keep: number = DRIVE_KEEP_FOLDERS,
): { id: string; name: string }[] {
  const dated = folders.filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f.name));
  const sorted = [...dated].sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
  return sorted.slice(keep);
}

/** Redak o Drive kopiji u mailu (uspjeh ili jasna napomena o neuspjehu). */
export function driveMailLine(
  info:
    | { ok: true; folder: string; files: number; bytes: number; webViewLink: string | null }
    | { ok: false; error: string },
): { text: string; html: string } {
  if (!info.ok) {
    const reason = String(info.error).replace(/[<>&]/g, "");
    return {
      text: `Drive NIJE uspio: ${reason}`,
      html: `<p><strong>Drive NIJE uspio:</strong> ${reason}</p>`,
    };
  }
  const mb = `${(info.bytes / (1024 * 1024)).toFixed(1)} MB`;
  const label = `Kopija na Google Driveu: ${DRIVE_ROOT_FOLDER_NAME}/${info.folder} — ${info.files} datoteka, ${mb}`;
  return {
    text: info.webViewLink ? `${label}\n${info.webViewLink}` : label,
    html: info.webViewLink
      ? `<p><a href="${info.webViewLink}">${label}</a></p>`
      : `<p>${label}</p>`,
  };
}

// ---------------------------------------------------------------------------
// Klijent
// ---------------------------------------------------------------------------

export type DriveClient = ReturnType<typeof createDriveClient>;

export function createDriveClient(fetchImpl: typeof fetch = fetch) {
  let cachedToken: string | null = null;

  async function getAccessToken(): Promise<string> {
    if (cachedToken) return cachedToken;
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: envVar("GDRIVE_CLIENT_ID"),
      client_secret: envVar("GDRIVE_CLIENT_SECRET"),
      refresh_token: envVar("GDRIVE_REFRESH_TOKEN"),
    });
    const res = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`token ${res.status}: ${text}`);
    const json = JSON.parse(text);
    if (!json.access_token) throw new Error("token bez access_token");
    cachedToken = json.access_token as string;
    return cachedToken;
  }

  async function api(path: string, init: RequestInit = {}): Promise<any> {
    const token = await getAccessToken();
    const res = await fetchImpl(`${DRIVE_API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`drive ${path} ${res.status}: ${text}`);
    return text ? JSON.parse(text) : {};
  }

  function quote(v: string): string {
    return v.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }

  /** Nađi mapu po imenu (i roditelju); stvori je ako ne postoji. */
  async function ensureFolder(name: string, parentId?: string): Promise<string> {
    const q = [
      `name='${quote(name)}'`,
      `mimeType='${DRIVE_FOLDER_MIME}'`,
      "trashed=false",
      ...(parentId ? [`'${quote(parentId)}' in parents`] : []),
    ].join(" and ");
    const found = await api(`/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=10`);
    const hit = (found.files ?? [])[0];
    if (hit?.id) return hit.id as string;
    const created = await api("/files?fields=id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        mimeType: DRIVE_FOLDER_MIME,
        ...(parentId ? { parents: [parentId] } : {}),
      }),
    });
    return created.id as string;
  }

  /** Postoji li mapa i nije u smeću? */
  async function folderUsable(id: string): Promise<boolean> {
    try {
      const f = await api(`/files/${encodeURIComponent(id)}?fields=id,trashed,mimeType`);
      return f?.trashed === false && f?.mimeType === DRIVE_FOLDER_MIME;
    } catch {
      return false;
    }
  }

  async function listFolder(parentId: string): Promise<DriveFile[]> {
    const out: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const q = `'${quote(parentId)}' in parents and trashed=false`;
      const params = new URLSearchParams({
        q,
        fields: "nextPageToken,files(id,name,size,mimeType)",
        pageSize: "200",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const page = await api(`/files?${params.toString()}`);
      for (const f of page.files ?? []) {
        out.push({ id: f.id, name: f.name, size: Number(f.size ?? 0) });
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
    return out;
  }

  async function folderLink(id: string): Promise<string | null> {
    try {
      const f = await api(`/files/${encodeURIComponent(id)}?fields=webViewLink`);
      return f?.webViewLink ?? null;
    } catch {
      return null;
    }
  }

  async function trashFile(id: string): Promise<void> {
    await api(`/files/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trashed: true }),
    });
  }

  /**
   * Resumable upload sa STREAMANIM tijelom iz Storagea — datoteka nikad
   * ne ulazi cijela u memoriju.
   */
  async function uploadFromStorage(
    supabase: any,
    bucket: string,
    path: string,
    name: string,
    parentId: string,
    sizeBytes: number,
    mimeType = "application/octet-stream",
  ): Promise<{ id: string; bytes: number }> {
    const token = await getAccessToken();

    const start = await fetchImpl(`${DRIVE_UPLOAD_API}/files?uploadType=resumable&fields=id`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType,
        "X-Upload-Content-Length": String(sizeBytes),
      },
      body: JSON.stringify({ name, parents: [parentId] }),
    });
    if (!start.ok) throw new Error(`resumable start ${start.status}: ${await start.text()}`);
    const sessionUri = start.headers.get("location");
    if (!sessionUri) throw new Error("resumable start bez Location zaglavlja");

    const { data: signed, error: signErr } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 3600);
    if (signErr || !signed?.signedUrl) throw new Error(signErr?.message ?? "nema potpisanog linka");
    const src = await fetchImpl(signed.signedUrl);
    if (!src.ok || !src.body) throw new Error(`storage download ${src.status}`);

    const put = await fetchImpl(sessionUri, {
      method: "PUT",
      headers: { "Content-Length": String(sizeBytes), "Content-Type": mimeType },
      body: src.body,
      // Deno traži eksplicitan način slanja toka.
      ...({ duplex: "half" } as Record<string, unknown>),
    } as RequestInit);
    if (!put.ok) throw new Error(`resumable put ${put.status}: ${await put.text()}`);
    const json = JSON.parse((await put.text()) || "{}");
    return { id: json.id, bytes: sizeBytes };
  }

  return {
    getAccessToken,
    ensureFolder,
    folderUsable,
    folderLink,
    listFolder,
    trashFile,
    uploadFromStorage,
  };
}
