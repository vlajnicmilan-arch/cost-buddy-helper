-- Add milestone_ids array column to project_work_entries
ALTER TABLE public.project_work_entries 
ADD COLUMN milestone_ids uuid[] DEFAULT '{}';

-- Add check constraint to limit to maximum 3 milestones
ALTER TABLE public.project_work_entries 
ADD CONSTRAINT max_three_milestones CHECK (array_length(milestone_ids, 1) IS NULL OR array_length(milestone_ids, 1) <= 3);