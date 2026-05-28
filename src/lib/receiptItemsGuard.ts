/**
 * Pure helper koji štiti od regresije "AI skenirani račun spremljen bez receipt_items".
 *
 * Pravilo: ako je transakcija označena kao `ai_extracted=true`, OČEKUJEMO
 * da nositelj poziva proslijedi i `items` polje. Ako toga nema, to je
 * skoro sigurno znak da je negdje uz put (wrapper, dialog onSave, prop drop)
 * polje `items` izgubljeno — što je točno bug koji se dogodio između
 * 21.03.–28.05.2026 (422/422 AI scanova bez items).
 *
 * Helper je pure i nema runtime ovisnosti — koristi se i u testovima i u
 * `useExpenseCRUD.addExpense` koji emitira warning + diagnostic log.
 */

export interface ReceiptItemsGuardInput {
  readonly aiExtracted: boolean | null | undefined;
  readonly items: ReadonlyArray<unknown> | null | undefined;
}

export function shouldWarnMissingItems(input: ReceiptItemsGuardInput): boolean {
  if (!input.aiExtracted) return false;
  if (!input.items) return true;
  return input.items.length === 0;
}
