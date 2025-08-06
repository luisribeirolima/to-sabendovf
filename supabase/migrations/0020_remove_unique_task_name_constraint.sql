-- Migration 0020: Remove Unique Constraint on Task Names per Project
-- This migration removes the rule that prevented tasks from having the same name within the same project.
-- This allows for more flexible task creation, especially during imports.

ALTER TABLE public.tasks
DROP CONSTRAINT IF EXISTS tasks_project_id_name_key;

-- Log a confirmation message
SELECT 'Migration 0020: Constraint tasks_project_id_name_key removed successfully.';
