/**
 * B — zajednički oblik podataka za PDF i Excel izlaz paketa za knjigovođu.
 * Oba izlaza prikazuju ISTI sadržaj; ovdje su samo tipovi, bez logike.
 */
import type { VatRateRow, HandoverTotals } from './handoverPackage';

export interface HandoverRowView {
  supplier: string;
  oib: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  base: number;
  vat: number;
  total: number;
  paymentMethod: string;
  categoryLabel: string;
  /** Izvedena oznaka „materijalni trošak" (ne sprema se). */
  material: boolean;
  projectName: string;
}

export interface HandoverGroupView {
  title: string;
  rows: HandoverRowView[];
  total: number;
  vat: number;
}

export interface HandoverReportData {
  companyName: string;
  /** Npr. „rujan 2026". */
  periodLabel: string;
  /** `YYYY-MM` — koristi se u nazivu datoteke. */
  period: string;
  currency: string;
  groups: HandoverGroupView[];
  vatRecap: VatRateRow[];
  totals: HandoverTotals;
  /** Računi za predaju bez datuma računa — samo za provjeru. */
  missingDate: HandoverRowView[];
}
