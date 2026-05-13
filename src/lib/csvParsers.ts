import { Category, PaymentSource, TransactionType } from '@/types/expense';
import { sanitizeCsvField } from './csvSecurity';

export interface ParsedTransaction {
  date: Date;
  amount: number;
  description: string;
  type: TransactionType;
  category: Category;
  merchant_name?: string;
  source: string;
  payment_source: PaymentSource;
}

// Detect if transaction is an internal transfer between own accounts
export function isInternalTransfer(description: string): boolean {
  const desc = description.toLowerCase();
  
  // Keywords that indicate internal transfers
  const transferKeywords = [
    // Aircash transfers
    'uplata na aircash',
    'nadoplata aircash',
    'aircash top up',
    'top up aircash',
    'aircash nadoplata',
    // Revolut transfers
    'revolut top up',
    'revolut nadoplata',
    'top-up',
    'topup',
    'uplata revolut',
    'nadoplata revolut',
    'added money',
    'money added',
    // General bank transfers
    'prijenos na vlastiti',
    'prijenos između računa',
    'prijenos s računa',
    'prijenos na račun',
    'transfer between accounts',
    'internal transfer',
    'interni prijenos',
    'prebacivanje sredstava',
    'transfer to own',
    'transfer from own',
    'own account transfer',
    'vlastiti račun',
    // Croatian bank specific
    'pbz prijenos',
    'erste prijenos',
    'zaba prijenos',
    'otp prijenos',
    'rba prijenos',
    'raiffeisen prijenos',
    'addiko prijenos',
    'hpb prijenos',
    'sberbank prijenos',
    // Card top-ups
    'visa top up',
    'mastercard top up',
    'maestro top up',
    'card top up',
    'kartica nadoplata',
    'nadoplata kartice',
    'dopuna kartice',
    // ATM and cash operations
    'podizanje gotovine',
    'bankomat podizanje',
    'atm withdrawal',
    'atm',
    'bankomat',
    'cash withdrawal',
    'polog gotovine',
    'cash deposit',
    'uplata gotovine',
    // Crypto transfers between wallets
    'transfer to wallet',
    'prijenos na wallet',
    'crypto transfer',
    'wallet transfer',
    // Exchange operations
    'exchange',
    'mjenjačnica',
    'currency exchange',
    'forex',
    'konverzija valute',
    'currency conversion',
    // Specific patterns
    'nadoplata putem',
    'savings transfer',
    'štednja prijenos',
    'oročena sredstva',
    'tekući račun prijenos',
    // PayPal and digital wallets
    'paypal transfer',
    'paypal prijenos',
    'wise transfer',
    'skrill transfer',
    'n26 transfer',
    // Loan/credit related transfers
    'otplata kredita',
    'rata kredita',
    'kredit prijenos',
    // Investment transfers
    'ulaganje',
    'investment transfer',
    'fond prijenos',
    'dionice prijenos'
  ];
  
  // Check for any transfer keyword
  for (const keyword of transferKeywords) {
    if (desc.includes(keyword)) {
      return true;
    }
  }
  
  // Pattern: "Uplata na X - Y" where X is a payment platform name
  const paymentPlatforms = ['aircash', 'revolut', 'paypal', 'skrill', 'wise', 'n26', 'curve', 'bunq', 'monzo', 'transferwise'];
  for (const platform of paymentPlatforms) {
    if (desc.includes(`uplata na ${platform}`) || 
        desc.includes(`prijenos na ${platform}`) ||
        desc.includes(`transfer to ${platform}`) ||
        desc.includes(`${platform} uplata`) ||
        desc.includes(`${platform} prijenos`)) {
      return true;
    }
  }
  
  // Pattern: Croatian bank names with transfer keywords
  const croatianBanks = ['pbz', 'erste', 'zaba', 'zagrebačka banka', 'otp', 'rba', 'raiffeisen', 'addiko', 'hpb', 'sberbank', 'kentbank', 'agram banka', 'partner banka', 'podravska banka', 'samoborska banka', 'slatinska banka'];
  for (const bank of croatianBanks) {
    if (desc.includes(bank) && (desc.includes('prijenos') || desc.includes('transfer') || desc.includes('prebacivanje'))) {
      return true;
    }
  }
  
  // Pattern: Card-based top-up (e.g., "Visa *** 1234" for top-ups)
  if ((desc.includes('visa') || desc.includes('mastercard') || desc.includes('maestro') || desc.includes('diners') || desc.includes('amex') || desc.includes('american express')) && 
      (desc.includes('top') || desc.includes('nadoplata') || desc.includes('uplata') || desc.includes('dopuna'))) {
    return true;
  }
  
  // Pattern: IBAN to IBAN transfer (HR IBAN format)
  if (/hr\d{2}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{1}/.test(desc) && 
      (desc.includes('prijenos') || desc.includes('transfer') || desc.includes('prebacivanje'))) {
    return true;
  }
  
  return false;
}

// Map source name to payment source
export function mapSourceToPaymentSource(source: string): PaymentSource {
  const sourceLower = source.toLowerCase();
  
  if (sourceLower.includes('revolut')) return 'revolut';
  if (sourceLower.includes('aircash')) return 'aircash';
  if (sourceLower.includes('pbz') || sourceLower.includes('erste') || 
      sourceLower.includes('zaba') || sourceLower.includes('banka')) return 'bank';
  if (sourceLower.includes('crypto') || sourceLower.includes('bitcoin')) return 'crypto';
  if (sourceLower.includes('gotovina') || sourceLower.includes('cash')) return 'cash';
  
  return 'other';
}

// Detect actual payment source from transaction description with specific card types
export function detectPaymentSourceFromDescription(description: string, defaultSource: PaymentSource = 'other'): PaymentSource {
  const desc = description.toLowerCase();
  
  // Visa variants
  if (desc.includes('visa platinum') || desc.includes('platinum visa') || desc.includes('visa infinite')) {
    return 'visa_platinum';
  }
  if (desc.includes('visa gold') || desc.includes('gold visa')) {
    return 'visa_gold';
  }
  if (desc.includes('visa kekspay') || desc.includes('kekspay visa')) {
    return 'visa_kekspay';
  }
  if (desc.includes('visa erste') || desc.includes('erste visa')) {
    return 'visa_erste';
  }
  if (desc.includes('visa') && !desc.includes('aircash')) {
    return 'visa';
  }
  
  // Mastercard variants
  if (desc.includes('mastercard platinum') || desc.includes('platinum mastercard') || desc.includes('mc platinum')) {
    return 'mastercard_platinum';
  }
  if (desc.includes('mastercard gold') || desc.includes('gold mastercard') || desc.includes('mc gold')) {
    return 'mastercard_gold';
  }
  if (desc.includes('mastercard') || desc.includes('master card') || desc.includes(' mc ')) {
    return 'mastercard';
  }
  if (desc.includes('maestro')) {
    return 'maestro';
  }
  
  // Other cards
  if (desc.includes('american express') || desc.includes('amex')) {
    return 'amex';
  }
  if (desc.includes('diners') || desc.includes('dc ')) {
    return 'diners';
  }
  
  // Digital wallets
  if (desc.includes('revolut')) {
    return 'revolut';
  }
  if (desc.includes('aircash')) {
    return 'aircash';
  }
  if (desc.includes('kekspay') || desc.includes('keks pay')) {
    return 'visa_kekspay';
  }
  
  // Generic bank/card keywords
  if (desc.includes('pbz') || desc.includes('erste') || desc.includes('zaba') || 
      desc.includes('otp') || desc.includes('raiffeisen') || desc.includes('addiko') ||
      desc.includes('rba') || desc.includes('hpb')) {
    return 'bank';
  }
  
  // Cash indicators
  if (desc.includes('gotovina') || desc.includes('tisak') || desc.includes('bankomat') || desc.includes('atm')) {
    return 'cash';
  }
  
  // Crypto
  if (desc.includes('bitcoin') || desc.includes('ethereum') || desc.includes('crypto') ||
      desc.includes('binance') || desc.includes('coinbase')) {
    return 'crypto';
  }
  
  return defaultSource;
}

// Extract card info from description (e.g., "Visa *** 7262" -> { type: 'visa', last4: '7262' })
export function extractCardInfo(description: string): { cardType: string | null; last4: string | null } {
  const desc = description.toLowerCase();
  
  // Pattern: "Visa *** 1234" or "VISA *1234" or "visa ****1234"
  const cardPatterns = [
    /visa\s*[\*\s]+(\d{4})/i,
    /mastercard\s*[\*\s]+(\d{4})/i,
    /maestro\s*[\*\s]+(\d{4})/i,
    /mc\s*[\*\s]+(\d{4})/i,
    /amex\s*[\*\s]+(\d{4})/i,
    /diners\s*[\*\s]+(\d{4})/i,
    /kartica\s*[\*\s]+(\d{4})/i,
    /card\s*[\*\s]+(\d{4})/i,
    /\*{3,4}\s*(\d{4})/i, // Generic *** 1234 pattern
  ];
  
  for (const pattern of cardPatterns) {
    const match = description.match(pattern);
    if (match) {
      let cardType = 'card';
      if (desc.includes('visa')) cardType = 'Visa';
      else if (desc.includes('mastercard') || desc.includes(' mc ')) cardType = 'Mastercard';
      else if (desc.includes('maestro')) cardType = 'Maestro';
      else if (desc.includes('amex') || desc.includes('american express')) cardType = 'Amex';
      else if (desc.includes('diners')) cardType = 'Diners';
      
      return { cardType, last4: match[1] };
    }
  }
  
  return { cardType: null, last4: null };
}

// Enrich description with additional payment info
export function enrichDescription(description: string, source: string, paymentSource: PaymentSource): string {
  const cardInfo = extractCardInfo(description);
  const parts: string[] = [description];
  
  // Add card info if detected and not already in description
  if (cardInfo.cardType && cardInfo.last4) {
    if (!description.toLowerCase().includes(cardInfo.cardType.toLowerCase())) {
      parts.push(`[${cardInfo.cardType} *${cardInfo.last4}]`);
    }
  }
  
  // Add source bank info if not already obvious
  if (source && !description.toLowerCase().includes(source.toLowerCase())) {
    // Only add for bank sources that aren't already mentioned
    const bankKeywords = ['pbz', 'erste', 'zaba', 'otp', 'rba', 'raiffeisen', 'addiko', 'hpb'];
    const sourceLower = source.toLowerCase();
    const descLower = description.toLowerCase();
    
    if (bankKeywords.some(b => sourceLower.includes(b)) && !bankKeywords.some(b => descLower.includes(b))) {
      parts.push(`[${source}]`);
    }
  }
  
  return parts.join(' ');
}

export interface CSVParseResult {
  success: boolean;
  transactions: ParsedTransaction[];
  source: string;
  errors: string[];
}

// Auto-detect CSV format based on headers
export function detectCSVFormat(headers: string[]): string {
  const headerString = headers.join(',').toLowerCase();
  
  if (headerString.includes('completed date') && headerString.includes('balance')) {
    return 'revolut';
  }
  if (headerString.includes('datum') && headerString.includes('opis transakcije')) {
    return 'aircash';
  }
  if (headerString.includes('datum valute') || headerString.includes('iznos u valuti računa')) {
    return 'pbz';
  }
  if (headerString.includes('datum knjiženja') && headerString.includes('opis plaćanja')) {
    return 'erste';
  }
  if (headerString.includes('datum izvršenja') && headerString.includes('primatelj/platitelj')) {
    return 'zaba';
  }
  if (headerString.includes('date') && headerString.includes('amount') && headerString.includes('description')) {
    return 'generic';
  }
  
  return 'unknown';
}

// Parse CSV string to rows
export function parseCSVString(csvString: string): string[][] {
  const lines = csvString.split(/\r?\n/).filter(line => line.trim());
  const rows: string[][] = [];
  
  for (const line of lines) {
    // Handle quoted fields with commas
    const row: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if ((char === ',' || char === ';') && !inQuotes) {
        row.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    row.push(current.trim());
    rows.push(row);
  }
  
  return rows;
}

// Kategorize transaction based on description
export function categorizeTransaction(description: string): Category {
  const desc = description.toLowerCase();
  
  // Food & Restaurants
  if (
    desc.includes('restaurant') || desc.includes('restoran') ||
    desc.includes('cafe') || desc.includes('coffee') || desc.includes('kava') ||
    desc.includes('mcdonalds') || desc.includes('burger') ||
    desc.includes('pizza') || desc.includes('food') || desc.includes('hrana') ||
    desc.includes('grocery') || desc.includes('konzum') || desc.includes('spar') ||
    desc.includes('lidl') || desc.includes('kaufland') || desc.includes('plodine') ||
    desc.includes('studenac') || desc.includes('tommy') || desc.includes('interspar') ||
    desc.includes('pekara') || desc.includes('bakery') || desc.includes('wolt') ||
    desc.includes('glovo') || desc.includes('bolt food')
  ) {
    return 'food';
  }
  
  // Transport
  if (
    desc.includes('uber') || desc.includes('bolt') || desc.includes('taxi') ||
    desc.includes('fuel') || desc.includes('gorivo') || desc.includes('petrol') ||
    desc.includes('ina') || desc.includes('tifon') || desc.includes('lukoil') ||
    desc.includes('parking') || desc.includes('toll') || desc.includes('cestarina') ||
    desc.includes('hak') || desc.includes('zet') || desc.includes('bus') ||
    desc.includes('train') || desc.includes('vlak') || desc.includes('hž') ||
    desc.includes('airplane') || desc.includes('croatia airlines') ||
    desc.includes('ryanair') || desc.includes('wizz')
  ) {
    return 'transport';
  }
  
  // Shopping
  if (
    desc.includes('amazon') || desc.includes('ebay') || desc.includes('aliexpress') ||
    desc.includes('zara') || desc.includes('h&m') || desc.includes('mango') ||
    desc.includes('deichmann') || desc.includes('ikea') || desc.includes('bauhaus') ||
    desc.includes('pevex') || desc.includes('shopping') || desc.includes('kupovina') ||
    desc.includes('mall') || desc.includes('centar') || desc.includes('store') ||
    desc.includes('shop') || desc.includes('trgovina')
  ) {
    return 'shopping';
  }
  
  // Entertainment
  if (
    desc.includes('netflix') || desc.includes('spotify') || desc.includes('hbo') ||
    desc.includes('disney') || desc.includes('youtube') || desc.includes('gaming') ||
    desc.includes('steam') || desc.includes('playstation') || desc.includes('xbox') ||
    desc.includes('cinema') || desc.includes('kino') || desc.includes('cinestar') ||
    desc.includes('theater') || desc.includes('kazalište') || desc.includes('concert') ||
    desc.includes('koncert') || desc.includes('ticket') || desc.includes('ulaznica') ||
    desc.includes('arena')
  ) {
    return 'entertainment';
  }
  
  // Bills & Utilities
  if (
    desc.includes('hep') || desc.includes('elektra') || desc.includes('electric') ||
    desc.includes('plin') || desc.includes('gas') || desc.includes('voda') ||
    desc.includes('water') || desc.includes('iskon') || desc.includes('a1') ||
    desc.includes('t-com') || desc.includes('telemach') || desc.includes('optima') ||
    desc.includes('internet') || desc.includes('mobile') || desc.includes('mobitel') ||
    desc.includes('rent') || desc.includes('najam') || desc.includes('stanarina') ||
    desc.includes('insurance') || desc.includes('osiguranje') ||
    desc.includes('croatia osiguranje') || desc.includes('allianz') ||
    desc.includes('grawe') || desc.includes('subscription') || desc.includes('pretplata')
  ) {
    return 'bills';
  }
  
  // Health
  if (
    desc.includes('pharmacy') || desc.includes('ljekarna') ||
    desc.includes('doctor') || desc.includes('doktor') || desc.includes('liječnik') ||
    desc.includes('hospital') || desc.includes('bolnica') ||
    desc.includes('clinic') || desc.includes('klinika') || desc.includes('dental') ||
    desc.includes('zubar') || desc.includes('optika') || desc.includes('gym') ||
    desc.includes('fitness') || desc.includes('teretana') || desc.includes('health')
  ) {
    return 'health';
  }
  
  return 'other';
}

// Parse amount from various formats
function parseAmount(amountStr: string): number {
  // Remove currency symbols and whitespace
  let cleaned = amountStr.replace(/[€$£kn HRK EUR USD GBP\s]/gi, '').trim();
  
  // Handle European format (1.234,56) vs US format (1,234.56)
  if (cleaned.includes(',') && cleaned.includes('.')) {
    // Check which is the decimal separator (last one)
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    
    if (lastComma > lastDot) {
      // European format: 1.234,56
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // US format: 1,234.56
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (cleaned.includes(',')) {
    // Could be European decimal or thousands separator
    const parts = cleaned.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      // European decimal: 123,45
      cleaned = cleaned.replace(',', '.');
    } else {
      // Thousands separator: 1,234
      cleaned = cleaned.replace(',', '');
    }
  }
  
  return Math.abs(parseFloat(cleaned) || 0);
}

// Parse date from various formats
function parseDate(dateStr: string): Date {
  const cleaned = dateStr.trim();
  
  // Try ISO format first
  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) {
    return new Date(cleaned);
  }
  
  // European format: DD.MM.YYYY or DD/MM/YYYY
  const euroMatch = cleaned.match(/(\d{1,2})[\.\/](\d{1,2})[\.\/](\d{2,4})/);
  if (euroMatch) {
    const day = parseInt(euroMatch[1]);
    const month = parseInt(euroMatch[2]) - 1;
    let year = parseInt(euroMatch[3]);
    if (year < 100) year += 2000;
    return new Date(year, month, day);
  }
  
  // US format: MM/DD/YYYY
  const usMatch = cleaned.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usMatch) {
    const month = parseInt(usMatch[1]) - 1;
    const day = parseInt(usMatch[2]);
    const year = parseInt(usMatch[3]);
    return new Date(year, month, day);
  }
  
  // Fallback
  return new Date(cleaned);
}

// Revolut CSV parser
function parseRevolut(rows: string[][]): ParsedTransaction[] {
  const headers = rows[0].map(h => h.toLowerCase());
  const transactions: ParsedTransaction[] = [];
  
  const dateIdx = headers.findIndex(h => h.includes('completed date') || h.includes('started date'));
  const descIdx = headers.findIndex(h => h.includes('description'));
  const amountIdx = headers.findIndex(h => h === 'amount');
  const typeIdx = headers.findIndex(h => h === 'type');
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 3) continue;
    
    const amount = parseAmount(row[amountIdx] || '0');
    if (amount === 0) continue;
    
    const description = row[descIdx] || '';
    const rowType = row[typeIdx]?.toLowerCase() || '';
    
    // Check if it's a transfer first
    let transactionType: TransactionType;
    if (isInternalTransfer(description) || rowType.includes('topup') || rowType.includes('top-up')) {
      transactionType = 'transfer';
    } else if (parseFloat(row[amountIdx] || '0') > 0) {
      transactionType = 'income';
    } else {
      transactionType = 'expense';
    }
    
    const enrichedDescription = enrichDescription(description, 'Revolut', 'revolut');
    
    transactions.push({
      date: parseDate(row[dateIdx] || ''),
      amount,
      description: enrichedDescription,
      type: transactionType,
      category: categorizeTransaction(description),
      merchant_name: description.split(' - ')[0] || undefined,
      source: 'Revolut',
      payment_source: 'revolut'
    });
  }
  
  return transactions;
}

// Aircash CSV parser
function parseAircash(rows: string[][]): ParsedTransaction[] {
  const headers = rows[0].map(h => h.toLowerCase());
  const transactions: ParsedTransaction[] = [];
  
  const dateIdx = headers.findIndex(h => h.includes('datum'));
  const descIdx = headers.findIndex(h => h.includes('opis'));
  const amountIdx = headers.findIndex(h => h.includes('iznos'));
  const typeIdx = headers.findIndex(h => h.includes('tip') || h.includes('vrsta'));
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 3) continue;
    
    const amount = parseAmount(row[amountIdx] || '0');
    if (amount === 0) continue;
    
    const description = row[descIdx] || '';
    const typeStr = row[typeIdx]?.toLowerCase() || '';
    
    // Detect actual payment source from description
    // E.g., "Uplata na Aircash - Visa *** 7262" means source is bank card, not Aircash
    const paymentSource = detectPaymentSourceFromDescription(description, 'aircash');
    
    // Check if it's a transfer first
    let transactionType: TransactionType;
    if (isInternalTransfer(description) || typeStr.includes('nadoplata') || typeStr.includes('top up')) {
      transactionType = 'transfer';
    } else if (typeStr.includes('uplata') || typeStr.includes('primljeno') || 
               parseFloat(row[amountIdx] || '0') > 0) {
      transactionType = 'income';
    } else {
      transactionType = 'expense';
    }
    
    const enrichedDescription = enrichDescription(description, 'Aircash', paymentSource);
    
    transactions.push({
      date: parseDate(row[dateIdx] || ''),
      amount,
      description: enrichedDescription,
      type: transactionType,
      category: categorizeTransaction(description),
      merchant_name: description.split(' - ')[0] || undefined,
      source: 'Aircash',
      payment_source: paymentSource
    });
  }
  
  return transactions;
}

// PBZ CSV parser
function parsePBZ(rows: string[][]): ParsedTransaction[] {
  const headers = rows[0].map(h => h.toLowerCase());
  const transactions: ParsedTransaction[] = [];
  
  const dateIdx = headers.findIndex(h => h.includes('datum valute') || h.includes('datum'));
  const descIdx = headers.findIndex(h => h.includes('opis') || h.includes('svrha'));
  const amountIdx = headers.findIndex(h => h.includes('iznos'));
  const debitIdx = headers.findIndex(h => h.includes('duguje') || h.includes('rashod'));
  const creditIdx = headers.findIndex(h => h.includes('potražuje') || h.includes('prihod'));
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 3) continue;
    
    let amount = 0;
    let isCredit = false;
    
    if (debitIdx >= 0 && creditIdx >= 0) {
      const debit = parseAmount(row[debitIdx] || '0');
      const credit = parseAmount(row[creditIdx] || '0');
      amount = debit > 0 ? debit : credit;
      isCredit = credit > 0;
    } else {
      amount = parseAmount(row[amountIdx] || '0');
      isCredit = parseFloat(row[amountIdx] || '0') > 0;
    }
    
    if (amount === 0) continue;
    
    const description = row[descIdx] || '';
    
    // Check if it's a transfer
    let transactionType: TransactionType;
    if (isInternalTransfer(description)) {
      transactionType = 'transfer';
    } else if (isCredit) {
      transactionType = 'income';
    } else {
      transactionType = 'expense';
    }
    
    const paymentSource = detectPaymentSourceFromDescription(description, 'bank');
    const enrichedDescription = enrichDescription(description, 'PBZ', paymentSource);
    
    transactions.push({
      date: parseDate(row[dateIdx] || ''),
      amount,
      description: enrichedDescription,
      type: transactionType,
      category: categorizeTransaction(description),
      merchant_name: description.split(' ')[0] || undefined,
      source: 'PBZ',
      payment_source: paymentSource
    });
  }
  
  return transactions;
}

// Erste CSV parser
function parseErste(rows: string[][]): ParsedTransaction[] {
  const headers = rows[0].map(h => h.toLowerCase());
  const transactions: ParsedTransaction[] = [];
  
  const dateIdx = headers.findIndex(h => h.includes('datum knjiženja') || h.includes('datum'));
  const descIdx = headers.findIndex(h => h.includes('opis plaćanja') || h.includes('opis'));
  const amountIdx = headers.findIndex(h => h.includes('iznos'));
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 3) continue;
    
    const amountRaw = row[amountIdx] || '0';
    const amount = parseAmount(amountRaw);
    if (amount === 0) continue;
    
    const isCredit = parseFloat(amountRaw.replace(/[^\d,.-]/g, '').replace(',', '.')) > 0;
    const description = row[descIdx] || '';
    
    // Check if it's a transfer
    let transactionType: TransactionType;
    if (isInternalTransfer(description)) {
      transactionType = 'transfer';
    } else if (isCredit) {
      transactionType = 'income';
    } else {
      transactionType = 'expense';
    }
    
    const paymentSource = detectPaymentSourceFromDescription(description, 'bank');
    const enrichedDescription = enrichDescription(description, 'Erste', paymentSource);
    
    transactions.push({
      date: parseDate(row[dateIdx] || ''),
      amount,
      description: enrichedDescription,
      type: transactionType,
      category: categorizeTransaction(description),
      merchant_name: description.split(' ')[0] || undefined,
      source: 'Erste',
      payment_source: paymentSource
    });
  }
  
  return transactions;
}

// Zagrebačka banka CSV parser
function parseZaba(rows: string[][]): ParsedTransaction[] {
  const headers = rows[0].map(h => h.toLowerCase());
  const transactions: ParsedTransaction[] = [];
  
  const dateIdx = headers.findIndex(h => h.includes('datum izvršenja') || h.includes('datum'));
  const descIdx = headers.findIndex(h => h.includes('opis') || h.includes('primatelj'));
  const amountIdx = headers.findIndex(h => h.includes('iznos'));
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 3) continue;
    
    const amountRaw = row[amountIdx] || '0';
    const amount = parseAmount(amountRaw);
    if (amount === 0) continue;
    
    const isCredit = parseFloat(amountRaw.replace(/[^\d,.-]/g, '').replace(',', '.')) > 0;
    const description = row[descIdx] || '';
    
    // Check if it's a transfer
    let transactionType: TransactionType;
    if (isInternalTransfer(description)) {
      transactionType = 'transfer';
    } else if (isCredit) {
      transactionType = 'income';
    } else {
      transactionType = 'expense';
    }
    
    const paymentSource = detectPaymentSourceFromDescription(description, 'bank');
    const enrichedDescription = enrichDescription(description, 'Zagrebačka banka', paymentSource);
    
    transactions.push({
      date: parseDate(row[dateIdx] || ''),
      amount,
      description: enrichedDescription,
      type: transactionType,
      category: categorizeTransaction(description),
      merchant_name: description.split(' ')[0] || undefined,
      source: 'Zagrebačka banka',
      payment_source: paymentSource
    });
  }
  
  return transactions;
}

// Generic CSV parser (fallback)
function parseGeneric(rows: string[][]): ParsedTransaction[] {
  const headers = rows[0].map(h => h.toLowerCase());
  const transactions: ParsedTransaction[] = [];
  
  const dateIdx = headers.findIndex(h => h.includes('date') || h.includes('datum'));
  const descIdx = headers.findIndex(h => h.includes('description') || h.includes('opis') || h.includes('name'));
  const amountIdx = headers.findIndex(h => h.includes('amount') || h.includes('iznos') || h.includes('value'));
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 2) continue;
    
    const amountRaw = row[amountIdx] || row[1] || '0';
    const amount = parseAmount(amountRaw);
    if (amount === 0) continue;
    
    const isCredit = parseFloat(amountRaw.replace(/[^\d,.-]/g, '').replace(',', '.')) > 0;
    const description = row[descIdx] || row[0] || '';
    
    // Check if it's a transfer
    let transactionType: TransactionType;
    if (isInternalTransfer(description)) {
      transactionType = 'transfer';
    } else if (isCredit) {
      transactionType = 'income';
    } else {
      transactionType = 'expense';
    }
    
    const paymentSource = detectPaymentSourceFromDescription(description, 'other');
    const enrichedDescription = enrichDescription(description, 'CSV Import', paymentSource);
    
    transactions.push({
      date: parseDate(row[dateIdx] || row[2] || new Date().toISOString()),
      amount,
      description: enrichedDescription,
      type: transactionType,
      category: categorizeTransaction(description),
      merchant_name: description.split(' ')[0] || undefined,
      source: 'CSV Import',
      payment_source: paymentSource
    });
  }
  
  return transactions;
}

// Main parse function
export function parseCSV(csvContent: string): CSVParseResult {
  const errors: string[] = [];
  
  try {
    const rows = parseCSVString(csvContent);
    
    if (rows.length < 2) {
      return {
        success: false,
        transactions: [],
        source: 'unknown',
        errors: ['CSV datoteka je prazna ili nema dovoljno redaka']
      };
    }
    
    const headers = rows[0];
    const format = detectCSVFormat(headers);
    
    let transactions: ParsedTransaction[] = [];
    
    switch (format) {
      case 'revolut':
        transactions = parseRevolut(rows);
        break;
      case 'aircash':
        transactions = parseAircash(rows);
        break;
      case 'pbz':
        transactions = parsePBZ(rows);
        break;
      case 'erste':
        transactions = parseErste(rows);
        break;
      case 'zaba':
        transactions = parseZaba(rows);
        break;
      case 'generic':
        transactions = parseGeneric(rows);
        break;
      default:
        // Try generic parser as fallback
        transactions = parseGeneric(rows);
        if (transactions.length === 0) {
          errors.push('Nije moguće prepoznati format CSV datoteke');
        }
    }
    
    // Filter out invalid transactions
    transactions = transactions.filter(t => 
      !isNaN(t.date.getTime()) && 
      t.amount > 0 && 
      t.description.trim() !== ''
    );
    
    return {
      success: transactions.length > 0,
      transactions,
      source: format === 'unknown' ? 'CSV Import' : format.charAt(0).toUpperCase() + format.slice(1),
      errors
    };
    
  } catch (error) {
    return {
      success: false,
      transactions: [],
      source: 'unknown',
      errors: [`Greška pri parsiranju CSV-a: ${error instanceof Error ? error.message : 'Nepoznata greška'}`]
    };
  }
}

// Format source name for display
export const SOURCE_NAMES: Record<string, string> = {
  'revolut': 'Revolut',
  'aircash': 'Aircash',
  'pbz': 'PBZ',
  'erste': 'Erste Bank',
  'zaba': 'Zagrebačka banka',
  'generic': 'CSV Import',
  'unknown': 'Nepoznati format'
};
