/**
 * geminiClient.ts — jedinstveni adapter za sve edge funkcije koje zovu Gemini modele.
 *
 * Cilj: prebaciti produkcijski AI s Lovable AI Gateway-a (https://ai.gateway.lovable.dev)
 * na direktni Google Generative Language API, uz brzi rollback bez deploy-a koda.
 *
 * ROLLBACK: postavi env var USE_DIRECT_GEMINI="false" u Supabase secrets. Sljedeći
 * poziv će opet ići kroz Lovable gateway (isti body, isti odgovori — nema promjene
 * za pozivatelje).
 *
 * API pozivatelja NAMJERNO oponaša fetch(gateway) — vraća `Response` u OpenAI
 * chat.completions formatu (i za JSON i za SSE stream), tako da pozivateljima
 * treba samo zamjena URL-a/headera na `callGemini(body)`.
 */

// -----------------------------------------------------------------------------
// Config
// -----------------------------------------------------------------------------

const USE_DIRECT = (Deno.env.get('USE_DIRECT_GEMINI') ?? 'true').toLowerCase() === 'true';
const GOOGLE_KEY = Deno.env.get('GOOGLE_GEMINI_API_KEY');
const LOVABLE_KEY = Deno.env.get('LOVABLE_API_KEY');

const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const GOOGLE_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Mapiranje Lovable modela → direktni Google Gemini modeli.
 *
 * PINNING (2026-07-16, Milanov zahtjev):
 * Google-ov novi API ključ vraća 404 "no longer available to new users" za
 * sve 2.x modele. Radi samo generacija 3.x. Aliase `*-latest` NE koristimo
 * jer Google ih tiho mijenja — pinamo konkretnu verziju i mijenjamo je
 * svjesno kroz code review.
 *
 * PREVIEW modeli (⚠️): Google smije povući/promijeniti preview model BEZ najave.
 * Za svaki PREVIEW ispod obvezno drži unos u `FALLBACK_MODEL_MAP` na stabilnu
 * alternativu. Pratiti Gemini changelog — čim izađe stable verzija (npr.
 * gemini-3.5-pro, gemini-3-flash bez `-preview`), zamijeni odmah.
 */
const DIRECT_MODEL_MAP: Record<string, string> = {
  'google/gemini-2.5-flash': 'gemini-3.5-flash',            // stable
  'google/gemini-2.5-flash-lite': 'gemini-3.1-flash-lite',  // stable
  'google/gemini-2.5-pro': 'gemini-3.1-pro-preview',        // ⚠️ PREVIEW — pratiti deprecation, zamijeniti stabilnom verzijom čim izađe
  // Milan odobrio 16.7.2026 — jedini model koji financial-assistant koristi (streaming).
  'google/gemini-3-flash-preview': 'gemini-3-flash-preview', // ⚠️ PREVIEW — pratiti deprecation, zamijeniti stabilnom verzijom čim izađe
};

/**
 * Automatski fallback ako Google vrati 404 / "model not available" za primarni
 * (obično PREVIEW) model. Aktivira se SAMO na nedostupnost modela — ne na 429
 * rate-limit, 400 bad request ni 5xx. Retry se izvede maksimalno JEDANPUT po
 * pozivu (nema petlje: fallback model ne smije imati vlastiti fallback).
 *
 * Izbor: `gemini-3.5-flash` je najstabilniji općenamjenski model dostupan na
 * ovom ključu (curl 200). `-pro-preview` fallback je downgrade na `-3.5-flash`
 * (a ne `flash-lite`) jer PDF parse trebala razumjeti kompleksnu strukturu.
 * `-3-flash-preview` (chat asistent) ide na isti `-3.5-flash` — dovoljno brz
 * za tool-calling i ima streaming.
 */
const FALLBACK_MODEL_MAP: Record<string, string> = {
  'gemini-3.1-pro-preview': 'gemini-3.5-flash',
  'gemini-3-flash-preview': 'gemini-3.5-flash',
};

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

export interface OpenAIChatBody {
  model: string;
  messages: any[];
  tools?: any[];
  tool_choice?: any;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  response_format?: { type: string };
}

/**
 * Odlučuje treba li retry s fallback modelom. Odvojena čista funkcija radi
 * testabilnosti (vidi geminiClient.fallback.test.ts).
 */
export function shouldFallbackOnError(status: number, errText: string): boolean {
  if (status !== 404) return false;
  return /no longer available|not found|model_not_found|not supported/i.test(errText);
}

/**
 * Zove Gemini (direktno ili preko Lovable gateway-a) s OpenAI-kompatibilnim
 * body-jem i vraća `Response` u OpenAI formatu.
 */
export async function callGemini(body: OpenAIChatBody, opts?: { timeoutMs?: number }): Promise<Response> {
  const directModel = DIRECT_MODEL_MAP[body.model];
  const canDirect = USE_DIRECT && GOOGLE_KEY && directModel;

  if (!canDirect) {
    return callViaGateway(body, opts?.timeoutMs);
  }

  try {
    return await callDirectGemini(body, directModel!, opts?.timeoutMs);
  } catch (e) {
    console.error('[geminiClient] direct call failed, falling back to gateway:', e);
    return callViaGateway(body, opts?.timeoutMs);
  }
}

// -----------------------------------------------------------------------------
// Gateway path (rollback / unsupported models)
// -----------------------------------------------------------------------------

async function callViaGateway(body: OpenAIChatBody, timeoutMs = 60_000): Promise<Response> {
  if (!LOVABLE_KEY) {
    return new Response(
      JSON.stringify({ error: 'LOVABLE_API_KEY not configured (gateway fallback)' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

// -----------------------------------------------------------------------------
// Direct Google Gemini path
// -----------------------------------------------------------------------------

async function callDirectGemini(body: OpenAIChatBody, model: string, timeoutMs = 60_000): Promise<Response> {
  const geminiBody = openAIToGemini(body);
  const isStream = body.stream === true;
  const endpoint = isStream ? 'streamGenerateContent?alt=sse' : 'generateContent';
  const url = `${GOOGLE_BASE}/${model}:${endpoint}`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'x-goog-api-key': GOOGLE_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(geminiBody),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(t);
  }

  if (!upstream.ok) {
    const errText = await upstream.text();
    // Poseban trag za "model no longer available" — inače se vidi samo kroz
    // "ne radi sken" u UI-u. Bilo bi glupo opet gubiti vrijeme na to.
    if (upstream.status === 404 && /no longer available/i.test(errText)) {
      console.error(
        `[geminiClient] MODEL_NOT_AVAILABLE: Google odbio model "${model}" (mapiran iz "${body.model}"). ` +
        `Ažuriraj DIRECT_MODEL_MAP u supabase/functions/_shared/geminiClient.ts.`,
      );
    } else {
      console.error('[geminiClient] Google API error:', upstream.status, errText.slice(0, 500));
    }
    // Prosljeđujemo status kod (429, 400, 500...) da pozivatelji njihova postojeća
    // rukovanja (429/402) i dalje rade. 402 ne postoji na Googlu.
    return new Response(
      JSON.stringify({ error: `Google Gemini API error ${upstream.status}`, detail: errText.slice(0, 1000) }),
      { status: upstream.status, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (isStream) {
    return new Response(geminiSSEToOpenAISSE(upstream.body!), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  const data = await upstream.json();
  const openAIResp = geminiToOpenAIResponse(data);
  return new Response(JSON.stringify(openAIResp), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// -----------------------------------------------------------------------------
// OpenAI → Gemini prijevod
// -----------------------------------------------------------------------------

function openAIToGemini(body: OpenAIChatBody): any {
  const contents: any[] = [];
  let systemInstruction: any = undefined;

  for (const msg of body.messages) {
    if (msg.role === 'system') {
      const text = normalizeToText(msg.content);
      systemInstruction = { parts: [{ text }] };
      continue;
    }
    if (msg.role === 'tool') {
      const responseObj = safeToObject(msg.content);
      contents.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name: msg.name ?? msg.tool_call_id ?? 'tool',
            response: responseObj,
          },
        }],
      });
      continue;
    }
    if (msg.role === 'assistant') {
      const parts: any[] = [];
      if (msg.content) {
        const text = normalizeToText(msg.content);
        if (text) parts.push({ text });
      }
      if (Array.isArray(msg.tool_calls)) {
        for (const tc of msg.tool_calls) {
          let args: any = {};
          try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { args = {}; }
          parts.push({ functionCall: { name: tc.function?.name, args } });
        }
      }
      contents.push({ role: 'model', parts: parts.length ? parts : [{ text: '' }] });
      continue;
    }
    // user
    contents.push({ role: 'user', parts: contentToGeminiParts(msg.content) });
  }

  const req: any = { contents };
  if (systemInstruction) req.systemInstruction = systemInstruction;

  const genCfg: any = {};
  if (typeof body.temperature === 'number') genCfg.temperature = body.temperature;
  if (typeof body.max_tokens === 'number') genCfg.maxOutputTokens = body.max_tokens;
  if (body.response_format?.type === 'json_object') genCfg.responseMimeType = 'application/json';
  if (Object.keys(genCfg).length) req.generationConfig = genCfg;

  if (Array.isArray(body.tools) && body.tools.length) {
    const functionDeclarations = body.tools
      .filter((t: any) => t.type === 'function' && t.function)
      .map((t: any) => ({
        name: t.function.name,
        description: t.function.description,
        parameters: sanitizeSchema(t.function.parameters),
      }));
    if (functionDeclarations.length) {
      req.tools = [{ functionDeclarations }];

      if (body.tool_choice && typeof body.tool_choice === 'object' && body.tool_choice.type === 'function') {
        const name = body.tool_choice.function?.name;
        req.toolConfig = {
          functionCallingConfig: {
            mode: 'ANY',
            ...(name ? { allowedFunctionNames: [name] } : {}),
          },
        };
      }
    }
  }

  return req;
}

function contentToGeminiParts(content: any): any[] {
  if (content == null) return [{ text: '' }];
  if (typeof content === 'string') return [{ text: content }];
  if (!Array.isArray(content)) return [{ text: String(content) }];

  const parts: any[] = [];
  for (const p of content) {
    if (!p || typeof p !== 'object') continue;
    if (p.type === 'text') {
      parts.push({ text: String(p.text ?? '') });
    } else if (p.type === 'image_url') {
      const url = p.image_url?.url ?? '';
      const inline = dataUrlToInline(url);
      if (inline) parts.push({ inlineData: inline });
    } else if (p.type === 'file') {
      const data = p.file?.file_data ?? '';
      const inline = dataUrlToInline(data);
      if (inline) parts.push({ inlineData: inline });
    } else if (p.type === 'input_audio') {
      const b64 = p.input_audio?.data;
      const format = p.input_audio?.format || 'webm';
      if (b64) parts.push({ inlineData: { mimeType: `audio/${format}`, data: b64 } });
    }
  }
  return parts.length ? parts : [{ text: '' }];
}

function dataUrlToInline(url: string): { mimeType: string; data: string } | null {
  if (!url || typeof url !== 'string') return null;
  const m = url.match(/^data:([^;]+);base64,(.+)$/);
  if (m) return { mimeType: m[1], data: m[2] };
  return null;
}

function normalizeToText(content: any): string {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((p: any) => p && p.type === 'text')
      .map((p: any) => String(p.text ?? ''))
      .join('\n');
  }
  return String(content);
}

function safeToObject(content: any): any {
  if (content && typeof content === 'object') return content;
  if (typeof content !== 'string') return { result: String(content ?? '') };
  try { return JSON.parse(content); } catch { return { result: content }; }
}

/**
 * Uklanja polja iz JSON schema-e koja Google Gemini ne podržava
 * (`additionalProperties`, `$schema`, `nullable` na krivim mjestima itd.).
 * Konzervativan pass — čuva sve što nije poznat problem.
 */
function sanitizeSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(sanitizeSchema);
  const out: any = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === 'additionalProperties' || k === '$schema') continue;
    out[k] = sanitizeSchema(v);
  }
  return out;
}

// -----------------------------------------------------------------------------
// Gemini → OpenAI prijevod (odgovor)
// -----------------------------------------------------------------------------

function geminiToOpenAIResponse(data: any): any {
  const cand = data?.candidates?.[0];
  const parts = cand?.content?.parts || [];

  let text = '';
  const toolCalls: any[] = [];
  for (const p of parts) {
    if (typeof p?.text === 'string') text += p.text;
    if (p?.functionCall) {
      toolCalls.push({
        id: `call_${toolCalls.length}_${Date.now()}`,
        type: 'function',
        function: {
          name: p.functionCall.name,
          arguments: JSON.stringify(p.functionCall.args ?? {}),
        },
      });
    }
  }

  const finishReason = toolCalls.length ? 'tool_calls' : mapFinish(cand?.finishReason);

  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: data?.modelVersion ?? 'gemini',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: text || null,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      },
      finish_reason: finishReason,
    }],
    ...(data?.usageMetadata ? {
      usage: {
        prompt_tokens: data.usageMetadata.promptTokenCount,
        completion_tokens: data.usageMetadata.candidatesTokenCount,
        total_tokens: data.usageMetadata.totalTokenCount,
      },
    } : {}),
  };
}

function mapFinish(g?: string): string {
  if (!g) return 'stop';
  const m: Record<string, string> = {
    STOP: 'stop',
    MAX_TOKENS: 'length',
    SAFETY: 'content_filter',
    RECITATION: 'content_filter',
    OTHER: 'stop',
  };
  return m[g] ?? 'stop';
}

// -----------------------------------------------------------------------------
// Streaming: Gemini SSE → OpenAI chat.completion.chunk SSE
// -----------------------------------------------------------------------------

function geminiSSEToOpenAISSE(input: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const id = `chatcmpl-${Date.now()}`;
  let buffer = '';

  return new ReadableStream({
    async start(controller) {
      const reader = input.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';
          for (const ev of events) {
            const line = ev.split('\n').find((l) => l.startsWith('data: '));
            if (!line) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;
            try {
              const chunk = JSON.parse(jsonStr);
              const parts = chunk?.candidates?.[0]?.content?.parts || [];
              for (const p of parts) {
                if (typeof p?.text === 'string' && p.text.length) {
                  const openAI = {
                    id,
                    object: 'chat.completion.chunk',
                    choices: [{ index: 0, delta: { content: p.text }, finish_reason: null }],
                  };
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(openAI)}\n\n`));
                }
                if (p?.functionCall) {
                  const openAI = {
                    id,
                    object: 'chat.completion.chunk',
                    choices: [{
                      index: 0,
                      delta: {
                        tool_calls: [{
                          index: 0,
                          id: `call_${Date.now()}`,
                          type: 'function',
                          function: {
                            name: p.functionCall.name,
                            arguments: JSON.stringify(p.functionCall.args ?? {}),
                          },
                        }],
                      },
                      finish_reason: null,
                    }],
                  };
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(openAI)}\n\n`));
                }
              }
              const fr = chunk?.candidates?.[0]?.finishReason;
              if (fr) {
                const openAI = {
                  id,
                  object: 'chat.completion.chunk',
                  choices: [{ index: 0, delta: {}, finish_reason: mapFinish(fr) }],
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(openAI)}\n\n`));
              }
            } catch (e) {
              console.warn('[geminiClient] SSE parse error:', e);
            }
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });
}
