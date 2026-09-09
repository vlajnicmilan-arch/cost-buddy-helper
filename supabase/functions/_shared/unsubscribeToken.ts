// deno-lint-ignore-file no-explicit-any
/**
 * Zajednička logika tokena za odjavu.
 *
 * Mail servis odbija svaku transakcijsku poruku bez `unsubscribe_token`
 * (400 "missing_unsubscribe"). Umjesto da svaka funkcija koja stavlja poruku
 * u red rješava to za sebe, token se osigurava na jednom mjestu — u
 * `process-email-queue`, neposredno prije poziva mail API-ja.
 */

/** Vrati postojeći token za adresu ili upiši novi. */
export async function getOrCreateUnsubscribeToken(
  supabase: any,
  email: string,
): Promise<string> {
  const normalized = String(email).trim().toLowerCase()

  const { data: existing, error: selectError } = await supabase
    .from('email_unsubscribe_tokens')
    .select('token')
    .eq('email', normalized)
    .maybeSingle()

  if (selectError) throw new Error(`unsubscribe_token select: ${selectError.message}`)
  if (existing?.token) return existing.token

  const fresh = crypto.randomUUID().replace(/-/g, '')
  const { error: insertError } = await supabase
    .from('email_unsubscribe_tokens')
    .insert({ email: normalized, token: fresh })

  if (insertError) {
    // Utrka: netko je u međuvremenu upisao token za istu adresu.
    const { data: retry } = await supabase
      .from('email_unsubscribe_tokens')
      .select('token')
      .eq('email', normalized)
      .maybeSingle()
    if (retry?.token) return retry.token
    throw new Error(`unsubscribe_token insert: ${insertError.message}`)
  }

  return fresh
}

/**
 * Osiguraj `unsubscribe_token` u payloadu poruke iz reda.
 * Ne mijenja payload ako token već postoji.
 */
export async function ensureUnsubscribeToken(
  supabase: any,
  payload: Record<string, any>,
): Promise<string | undefined> {
  if (payload?.unsubscribe_token) return payload.unsubscribe_token
  if (!payload?.to) return undefined
  return await getOrCreateUnsubscribeToken(supabase, payload.to)
}
