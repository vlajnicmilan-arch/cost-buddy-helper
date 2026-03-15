import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ERACUNI_API_URL = 'https://e-racuni.hr/WebServices/API';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const userId = claimsData.claims.sub;

    const body = await req.json();
    const { action, businessProfileId, invoiceData, invoiceId } = body;

    // Get business profile with e-Računi credentials
    const { data: profile, error: profileError } = await supabase
      .from('business_profiles')
      .select('*')
      .eq('id', businessProfileId)
      .eq('user_id', userId)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'Poslovni profil nije pronađen' }), { status: 404, headers: corsHeaders });
    }

    if (!profile.eracuni_username || !profile.eracuni_secret_key || !profile.eracuni_token) {
      return new Response(JSON.stringify({ error: 'e-Računi nije konfiguriran. Unesite API podatke u postavkama.' }), { status: 400, headers: corsHeaders });
    }

    const eracuniAuth = {
      username: profile.eracuni_username,
      secretKey: profile.eracuni_secret_key,
      token: profile.eracuni_token,
    };

    switch (action) {
      case 'test_connection': {
        const result = await callEracuni(eracuniAuth, 'SalesInvoiceList', {
          dateFrom: new Date().toISOString().split('T')[0],
          dateTo: new Date().toISOString().split('T')[0],
        });
        
        // Mark as connected
        await supabase
          .from('business_profiles')
          .update({ eracuni_connected: true })
          .eq('id', businessProfileId);

        return new Response(JSON.stringify({ success: true, message: 'Povezivanje uspješno!' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'create_invoice': {
        // Get invoice with items from DB
        const { data: invoice } = await supabase
          .from('invoices')
          .select('*')
          .eq('id', invoiceId)
          .eq('user_id', userId)
          .single();

        if (!invoice) {
          return new Response(JSON.stringify({ error: 'Račun nije pronađen' }), { status: 404, headers: corsHeaders });
        }

        const { data: items } = await supabase
          .from('invoice_items')
          .select('*')
          .eq('invoice_id', invoiceId);

        const { data: client } = invoice.client_id 
          ? await supabase.from('clients').select('*').eq('id', invoice.client_id).single()
          : { data: null };

        // Build e-Računi invoice object
        const salesInvoice: any = {
          number: invoice.invoice_number,
          dateIssued: invoice.issue_date,
          dateDue: invoice.due_date || invoice.issue_date,
          dateTransaction: invoice.issue_date,
          dateOfSupply: invoice.issue_date,
          status: 'issuedInvoice',
          invoiceType: profile.is_vat_payer ? 'R1' : 'R2',
          paymentMethod: 'bankTransfer',
          documentLanguage: 'Croatian',
          note: invoice.notes || '',
        };

        // Add buyer info
        if (client) {
          salesInvoice.buyerName = client.name;
          salesInvoice.buyerTaxNumber = client.oib || '';
          salesInvoice.buyerStreet = client.address || '';
          salesInvoice.buyerCity = client.city || '';
          salesInvoice.buyerCountry = 'HR';
        }

        // Add items
        salesInvoice.items = (items || []).map((item: any) => ({
          description: item.description,
          quantity: item.quantity || 1,
          unitOfMeasure: item.unit || 'kom',
          price: item.unit_price || 0,
          discountPercentage: item.discount || 0,
          vatPercentage: item.vat_rate || 0,
        }));

        const result = await callEracuni(eracuniAuth, 'SalesInvoiceCreate', {
          SalesInvoice: salesInvoice,
        });

        if (result.error) {
          return new Response(JSON.stringify({ error: result.error }), { status: 400, headers: corsHeaders });
        }

        return new Response(JSON.stringify({ success: true, data: result }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'fiscalize': {
        // Fiscalize existing invoice on e-Računi
        const { data: invoice } = await supabase
          .from('invoices')
          .select('*')
          .eq('id', invoiceId)
          .eq('user_id', userId)
          .single();

        if (!invoice) {
          return new Response(JSON.stringify({ error: 'Račun nije pronađen' }), { status: 404, headers: corsHeaders });
        }

        // First create/sync invoice on e-Računi, then fiscalize
        const fiscResult = await callEracuni(eracuniAuth, 'SalesInvoiceFiscalize', {
          number: invoice.invoice_number,
        });

        if (fiscResult.error) {
          return new Response(JSON.stringify({ error: `Fiskalizacija neuspješna: ${fiscResult.error}` }), { status: 400, headers: corsHeaders });
        }

        // Get JIR and ZKI from response
        const jir = fiscResult?.SalesInvoice?.fiscalVerificationID || fiscResult?.jir || null;
        const zki = fiscResult?.SalesInvoice?.fiscalSecurityCode || fiscResult?.zki || null;

        // Update invoice in our DB
        await supabase
          .from('invoices')
          .update({
            fiscalization_jir: jir,
            fiscalization_zki: zki,
            fiscalized_at: new Date().toISOString(),
            status: 'sent',
          })
          .eq('id', invoiceId);

        return new Response(JSON.stringify({ success: true, jir, zki }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get_pdf': {
        const { data: invoice } = await supabase
          .from('invoices')
          .select('*')
          .eq('id', invoiceId)
          .eq('user_id', userId)
          .single();

        if (!invoice) {
          return new Response(JSON.stringify({ error: 'Račun nije pronađen' }), { status: 404, headers: corsHeaders });
        }

        const result = await callEracuni(eracuniAuth, 'SalesInvoiceGetPDF', {
          number: invoice.invoice_number,
        });

        if (result.error) {
          return new Response(JSON.stringify({ error: result.error }), { status: 400, headers: corsHeaders });
        }

        return new Response(JSON.stringify({ success: true, pdf: result.pdfFile }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'send_eracun': {
        const { data: invoice } = await supabase
          .from('invoices')
          .select('*')
          .eq('id', invoiceId)
          .eq('user_id', userId)
          .single();

        if (!invoice) {
          return new Response(JSON.stringify({ error: 'Račun nije pronađen' }), { status: 404, headers: corsHeaders });
        }

        const result = await callEracuni(eracuniAuth, 'SendDocumentToAS4Endpoint', {
          documentNumber: invoice.invoice_number,
          documentType: 'SalesInvoice',
        });

        if (result.error) {
          return new Response(JSON.stringify({ error: result.error }), { status: 400, headers: corsHeaders });
        }

        await supabase
          .from('invoices')
          .update({
            eracun_sent: true,
            eracun_sent_at: new Date().toISOString(),
          })
          .eq('id', invoiceId);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Nepoznata akcija' }), { status: 400, headers: corsHeaders });
    }
  } catch (error) {
    console.error('e-Računi proxy error:', error);
    const msg = error instanceof Error ? error.message : 'Greška';
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});

async function callEracuni(auth: { username: string; secretKey: string; token: string }, method: string, parameters: any) {
  try {
    const response = await fetch(ERACUNI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: auth.username,
        secretKey: auth.secretKey,
        token: auth.token,
        method,
        parameters,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`e-Računi API error [${response.status}]: ${text}`);
    }

    const data = await response.json();
    
    if (data.status === 'error' || data.errorCode) {
      return { error: data.errorMessage || data.message || 'Nepoznata greška s e-Računi API-jem' };
    }

    return data;
  } catch (error) {
    console.error('e-Računi API call failed:', error);
    throw error;
  }
}
