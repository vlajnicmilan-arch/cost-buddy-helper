import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DetectedLoan {
  transactionId?: string;
  description: string;
  amount: number;
  date: Date;
  type: 'receivable' | 'payable';
  transactionFlow: 'inflow' | 'outflow';
  contactName: string;
  confidence: 'high' | 'medium';
  source: 'keyword' | 'ai';
}

// Croatian/English loan keywords
const LOAN_KEYWORDS = [
  'pozajmica', 'pozajmice', 'pozajmio', 'pozajmila', 'pozajmljeno',
  'zajam', 'zajmovi',
  'loan', 'lend', 'borrow',
  'posudio', 'posudila', 'posudba',
  'povrat pozajmice', 'povrat zajma',
  'vraćanje pozajmice', 'vraćanje zajma',
];

const RETURN_KEYWORDS = [
  'povrat pozajmice', 'povrat zajma', 'vraćanje pozajmice', 'vraćanje zajma',
  'return loan', 'repay', 'repayment',
];

/**
 * Extract contact name from a loan description.
 */
function extractContactFromDescription(desc: string): string | null {
  const fromPatterns = [
    /pozajmic[aeo]\s+od\s+(?:firme\s+|tvrtke\s+|poduze[cć]a\s+)?(.+)/i,
    /pozajmic[aeo]\s+za\s+(?:firmu\s+|tvrtku\s+|poduze[cć]e\s+)?(.+)/i,
    /pozajmic[aeo]\s+(?:firmi\s+|tvrtki\s+|poduze[cć]u\s+)(.+)/i,
    /zajam\s+od\s+(?:firme\s+|tvrtke\s+)?(.+)/i,
    /zajam\s+(?:firmi\s+|tvrtki\s+)(.+)/i,
    /pozajmic[aeo]\s+(.+)/i,
    /zajam\s+(.+)/i,
    /loan\s+(?:from|to)\s+(.+)/i,
  ];

  for (const pattern of fromPatterns) {
    const match = desc.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim().replace(/[,;.]+$/, '').trim();
      if (name.length >= 2) return name;
    }
  }

  return null;
}

function getTransactionFlow(amount: number, transactionType: string): 'inflow' | 'outflow' {
  const normalizedAmount = Number(amount);

  if (Number.isFinite(normalizedAmount) && normalizedAmount !== 0) {
    return normalizedAmount > 0 ? 'inflow' : 'outflow';
  }

  if (transactionType === 'income') return 'inflow';
  if (transactionType === 'expense') return 'outflow';

  return 'inflow';
}

function getLoanType(description: string, amount: number, transactionType: string): 'receivable' | 'payable' {
  const lower = description.toLowerCase();
  const isReturn = RETURN_KEYWORDS.some(kw => lower.includes(kw));
  const transactionFlow = getTransactionFlow(amount, transactionType);

  if (isReturn) {
    return transactionFlow === 'inflow' ? 'receivable' : 'payable';
  }

  return transactionFlow === 'inflow' ? 'payable' : 'receivable';
}

export const useLoanDetection = () => {
  /**
   * Quick keyword-based detection
   */
  const detectByKeywords = useCallback((description: string, amount: number, transactionType: string, date: Date, transactionId?: string): DetectedLoan | null => {
    const lower = description.toLowerCase();

    const hasLoanKeyword = LOAN_KEYWORDS.some(kw => lower.includes(kw));
    if (!hasLoanKeyword) return null;

    const contactName = extractContactFromDescription(description);
    const transactionFlow = getTransactionFlow(amount, transactionType);
    const type = getLoanType(description, amount, transactionType);

    return {
      transactionId,
      description,
      amount,
      date,
      type,
      transactionFlow,
      contactName: contactName || 'Nepoznato',
      confidence: contactName ? 'high' : 'medium',
      source: 'keyword',
    };
  }, []);

  /**
   * AI-based detection via dedicated edge function
   */
  const detectByAI = useCallback(async (transactions: Array<{ id?: string; description: string; amount: number; type: string; date: Date }>): Promise<DetectedLoan[]> => {
    if (transactions.length === 0) return [];

    try {
      console.log(`AI loan detection: sending ${transactions.length} transactions`);
      
      const { data, error } = await supabase.functions.invoke('detect-loans', {
        body: {
          transactions: transactions.map(tx => ({
            description: tx.description,
            amount: tx.amount,
            type: tx.type,
          })),
        },
      });

      if (error) {
        console.error('AI loan detection error:', error);
        return [];
      }

      console.log('AI loan detection response:', data);

      const loans = data?.loans || [];
      
      return loans.map((r: any) => {
        const tx = transactions[r.index - 1];
        if (!tx) return null;

        return {
          transactionId: tx.id,
          description: tx.description,
          amount: tx.amount,
          date: tx.date,
          type: getLoanType(tx.description, tx.amount, tx.type),
          transactionFlow: getTransactionFlow(tx.amount, tx.type),
          contactName: r.contact_name || 'Nepoznato',
          confidence: r.confidence as 'high' | 'medium',
          source: 'ai' as const,
        };
      }).filter(Boolean) as DetectedLoan[];
    } catch (e) {
      console.error('AI loan detection failed:', e);
      return [];
    }
  }, []);

  /**
   * Combined detection: keywords first, then AI for remaining
   */
  const detectLoans = useCallback(async (
    transactions: Array<{ id?: string; description: string; amount: number; type: string; date: Date }>
  ): Promise<DetectedLoan[]> => {
    const results: DetectedLoan[] = [];
    const remaining: typeof transactions = [];

    console.log(`Loan detection: scanning ${transactions.length} transactions`);

    // First pass: keyword detection
    for (const tx of transactions) {
      const detected = detectByKeywords(tx.description, tx.amount, tx.type, tx.date, tx.id);
      if (detected) {
        results.push(detected);
      } else {
        remaining.push(tx);
      }
    }

    console.log(`Keyword detection found ${results.length} loans, ${remaining.length} remaining for AI`);

    // Second pass: AI for remaining (batch max 30)
    if (remaining.length > 0) {
      const batch = remaining.slice(0, 30);
      const aiResults = await detectByAI(batch);
      results.push(...aiResults);
      console.log(`AI detection found ${aiResults.length} additional loans`);
    }

    console.log(`Total detected loans: ${results.length}`);
    return results;
  }, [detectByKeywords, detectByAI]);

  /**
   * Detect from a single transaction (for manual entry) - keyword only
   */
  const detectSingleLoan = useCallback((description: string, amount: number, type: string, date: Date): DetectedLoan | null => {
    return detectByKeywords(description, amount, type, date);
  }, [detectByKeywords]);

  return { detectLoans, detectSingleLoan, detectByKeywords };
};
