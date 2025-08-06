
-- Recria a função get_my_projects_details com uma subconsulta para maior confiabilidade
-- É necessário apagar a função antiga primeiro, pois o tipo de retorno está sendo modificado.
DROP FUNCTION IF EXISTS public.get_my_projects_details();

CREATE OR REPLACE FUNCTION public.get_my_projects_details()
RETURNS TABLE (
    id uuid,
    name text,
    description text,
    start_date date,
    end_date date,
    budget numeric,
    created_at timestamptz,
    collaborator_ids uuid[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.name,
        p.description,
        p.start_date,
        p.end_date,
        p.budget,
        p.created_at,
        -- Subconsulta para buscar e agregar os IDs dos colaboradores de forma mais confiável
        (SELECT array_agg(c.user_id) FROM public.collaborators c WHERE c.project_id = p.id) AS collaborator_ids
    FROM
        public.projects p
    WHERE
        -- A lógica de permissão não muda
        (SELECT public.get_my_role()) = 'Admin' OR p.id IN (
            SELECT project_id FROM public.collaborators WHERE user_id = auth.uid()
        );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

SELECT 'Função get_my_projects_details atualizada com sucesso para usar subconsulta.';
