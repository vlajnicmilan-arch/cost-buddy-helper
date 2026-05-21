import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Expense } from "@/types/expense";
import type { AIInsight } from "./useAIInsights";

/**
 * Deterministički, lokalni "data quality" uvidi za sekciju "Za pažnju".
 * Ne pozivaju AI — čisti compute na klijentu.
 * Faza A: samo 1 provjera (troškovi bez opisa u zadnjih 30 dana).
 */
export const useLocalAttentionInsights = (expenses: Expense[]): AIInsight[] => {
  const { t } = useTranslation();

  return useMemo(() => {
    const out: AIInsight[] = [];
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const uncategorized = expenses.filter(e => {
      if (e.type !== "expense") return false;
      const ts = new Date(e.date).getTime();
      if (Number.isNaN(ts) || ts < cutoff) return false;
      const desc = (e.description ?? "").trim();
      return desc.length === 0;
    });

    if (uncategorized.length >= 3) {
      out.push({
        id: "local:uncategorized",
        type: "data_quality_uncategorized",
        title: t("attention.dataQuality.uncategorized", { count: uncategorized.length }),
        prompt: t("attention.dataQuality.uncategorizedPrompt"),
        severity: "info",
        source: "local",
      });
    }

    return out;
  }, [expenses, t]);
};
