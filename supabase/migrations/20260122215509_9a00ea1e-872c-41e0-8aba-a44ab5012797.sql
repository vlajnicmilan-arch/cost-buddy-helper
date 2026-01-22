-- Create a table for custom payment sources
CREATE TABLE public.custom_payment_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '💳',
  color TEXT NOT NULL DEFAULT '#6b7280',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.custom_payment_sources ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own custom payment sources" 
ON public.custom_payment_sources 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own custom payment sources" 
ON public.custom_payment_sources 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own custom payment sources" 
ON public.custom_payment_sources 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own custom payment sources" 
ON public.custom_payment_sources 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_custom_payment_sources_updated_at
BEFORE UPDATE ON public.custom_payment_sources
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();