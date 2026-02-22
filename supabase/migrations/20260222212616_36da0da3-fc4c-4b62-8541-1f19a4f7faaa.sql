
-- Create the trigger that was missing
CREATE TRIGGER add_family_owner_trigger
AFTER INSERT ON public.family_groups
FOR EACH ROW
EXECUTE FUNCTION public.add_family_owner_as_member();
