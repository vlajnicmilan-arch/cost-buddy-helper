
ALTER TABLE public.custom_payment_sources ADD COLUMN currency text DEFAULT 'EUR';
ALTER TABLE public.profiles ADD COLUMN multi_currency_enabled boolean DEFAULT false;
