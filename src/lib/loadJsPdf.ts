// Shared lazy loader for jspdf + jspdf-autotable.
// These libraries are heavy (~420 KB combined). Importing them at the top of
// any component pulls them into that component's chunk AND any chunk that
// shares dependencies with it — which has historically bloated the initial
// bundle by ~600 KB (jspdf + html2canvas).
//
// Usage:
//   const { jsPDF, autoTable } = await loadJsPdf();
//   const doc = new jsPDF();
//   autoTable(doc, { ... });
import type { jsPDF as JsPDFType } from 'jspdf';

type AutoTableFn = typeof import('jspdf-autotable').default;

let pdfLibsPromise: Promise<{ jsPDF: typeof JsPDFType; autoTable: AutoTableFn }> | null = null;

export const loadJsPdf = () => {
  if (!pdfLibsPromise) {
    pdfLibsPromise = Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]).then(([jspdf, autotable]) => ({
      jsPDF: jspdf.default,
      autoTable: autotable.default,
    }));
  }
  return pdfLibsPromise;
};

// Re-export the type so callers can annotate variables without a top-level
// runtime import of jspdf (TypeScript types are erased at build time).
export type { JsPDFType };
