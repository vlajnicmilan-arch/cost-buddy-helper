// Returns the public Paddle client token + environment.
// The client token is designed to be exposed in the browser (Paddle.js).
// We serve it via edge function so it does not have to live in a committed .env.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve((req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const token = Deno.env.get('PADDLE_CLIENT_TOKEN') ?? '';
  const forced = (Deno.env.get('PADDLE_ENV') ?? '').toLowerCase();
  let environment: 'sandbox' | 'production' = 'production';
  if (forced === 'sandbox' || forced === 'production') {
    environment = forced;
  } else if (token.startsWith('test_')) {
    environment = 'sandbox';
  }

  return new Response(
    JSON.stringify({
      token,
      environment,
      configured: token.length > 0,
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    },
  );
});
