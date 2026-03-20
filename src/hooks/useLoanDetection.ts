import { useCallback } from 'react';
import { Expense } from '@/types/expense';
import { supabase } from '@/integrations/supabase/client';

export interface DetectedLoan {
  transactionId?: string;
  description: string;
  amount: number;
  date: Date;
  type: 'receivable' | 'payable'; // receivable = someone gave loan TO the business, payable = business gave loan
  contactName: string;
  confidence: 'high' | 'medium';
  source: 'keyword' | 'ai';
}

// Croatian/English loan keywords
const LOAN_KEYWORDS = [
  'pozajmica', 'pozajmice', 'pozajmio', 'pozajmila', 'pozajmljeno',
  'zajam', 'zajmovi', 'kredit',
  'loan', 'lend', 'borrow',
  'posudio', 'posudila', 'posudba',
  'dug', 'dugovanje',
  'povrat pozajmice', 'povrat zajma',
  'vraćanje pozajmice', 'vraćanje zajma',
];

const RETURN_KEYWORDS = [
  'povrat pozajmice', 'povrat zajma', 'vraćanje pozajmice', 'vraćanje zajma',
  'return loan', 'repay', 'repayment',
];

/**
 * Extract contact name from a loan description.
 * Patterns like:
 *   "Pozajmica Milan Horvat" -> "Milan Horvat"
 *   "Pozajmica od firme Akrobat d.o.o." -> "Akrobat d.o.o."
 *   "Zajam tvrtki Tactura" -> "Tactura"
 */
function extractContactFromDescription(desc: string): string | null {
  const lower = desc.toLowerCase();

  // Try pattern: "pozajmica od <name>" / "pozajmica za <name>"
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

export const useLoanDetection = () => {
  /**
   * Quick keyword-based detection
   */
  const detectByKeywords = useCallback((description: string, amount: number, transactionType: string, date: Date, transactionId?: string): DetectedLoan | null => {
    const lower = description.toLowerCase();

    const hasLoanKeyword = LOAN_KEYWORDS.some(kw => lower.includes(kw));
    if (!hasLoanKeyword) return null;

    const isReturn = RETURN_KEYWORDS.some(kw => lower.includes(kw));
    const contactName = extractContactFromDescription(description);

    // Determine type: if income transaction with loan keyword = someone lent TO us (receivable = we owe them = payable)
    // If expense with loan keyword = we lent to someone (receivable = they owe us)
    // If it's a return: reverse the logic
    let type: 'receivable' | 'payable';
    if (isReturn) {
      type = transactionType === 'income' ? 'receivable' : 'payable';
    } else {
      type = transactionType === 'income' ? 'payable' : 'receivable';
    }

    return {
      transactionId,
      description,
      amount,
      date,
      type,
      contactName: contactName || 'Nepoznato',
      confidence: contactName ? 'high' : 'medium',
      source: 'keyword',
    };
  }, []);

  /**
   * AI-based detection for transactions not caught by keywords
   */
  const detectByAI = useCallback(async (transactions: Array<{ id?: string; description: string; amount: number; type: string; date: Date }>): Promise<DetectedLoan[]> => {
    if (transactions.length === 0) return [];

    // Prepare descriptions for AI
    const txList = transactions.map((tx, i) => 
      `${i + 1}. "${tx.description}" | iznos: ${tx.amount} | tip: ${tx.type === 'income' ? 'uplata' : 'isplata'}`
    ).join('\n');

    try {
      const { data, error } = await supabase.functions.invoke('categorize-transaction', {
        body: {
          customPrompt: true,
          prompt: `Analiziraj sljedeće bankovne transakcije i identificiraj koje od njih su pozajmice, zajmovi ili krediti.
Za svaku detektiranu pozajmicu vrati:
- index (redni broj transakcije, počevši od 1)
- contact_name (ime osobe ili tvrtke)
- type: "receivable" ako netko duguje nama, "payable" ako mi dugujemo nekome
- confidence: "high" ili "medium"

Transakcije:
${txList}

Vrati JSON array: [{"index": 1, "contact_name": "...", "type": "receivable"|"payable", "confidence": "high"|"medium"}]
Ako nema pozajmica, vrati prazan array: []`,
        },
      });

      if (error) {
        console.error('AI loan detection error:', error);
        return [];
      }

      const responseText = typeof data === 'string' ? data : data?.result || data?.category || '';
      
      // Extract JSON array from response
      const jsonMatch = responseText.match(/\[[\s\S]*?\]/);
      if (!jsonMatch) return [];

      const results = JSON.parse(jsonMatch[0]);
      
      return results.map((r: any) => {
        const tx = transactions[r.index - 1];
        if (!tx) return null;
        return {
          transactionId: tx.id,
          description: tx.description,
          amount: tx.amount,
          date: tx.date,
          type: r.type as 'receivable' | 'payable',
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

    // First pass: keyword detection
    for (const tx of transactions) {
      const detected = detectByKeywords(tx.description, tx.amount, tx.type, tx.date, tx.id);
      if (detected) {
        results.push(detected);
      } else {
        remaining.push(tx);
      }
    }

    // Second pass: AI for remaining (batch max 20)
    if (remaining.length > 0) {
      const batch = remaining.slice(0, 20);
      const aiResults = await detectByAI(batch);
      results.push(...aiResults);
    }

    return results;
  }, [detectByKeywords, detectByAI]);

  /**
   * Detect from a single transaction (for manual entry)
   */
  const detectSingleLoan = useCallback((description: string, amount: number, type: string, date: Date): DetectedLoan | null => {
    return detectByKeywords(description, amount, type, date);
  }, [detectByKeywords]);

  return { detectLoans, detectSingleLoan, detectByKeywords };
};
