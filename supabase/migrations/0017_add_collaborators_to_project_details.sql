
-- Recria a função para incluir a lista de IDs de colaboradores em cada projeto
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
        -- Agrega os IDs dos colaboradores em um array
        array_agg(c.user_id) FILTER (WHERE c.user_id IS NOT NULL) AS collaborator_ids
    FROM
        public.projects p
    LEFT JOIN
        public.collaborators c ON p.id = c.project_id
    WHERE
        -- A lógica de permissão permanece a mesma:
        -- O usuário é um administrador OU é um colaborador do projeto.
        (
            SELECT public.get_my_role()
        ) = 'Admin' OR p.id IN (
            SELECT project_id FROM public.collaborators WHERE user_id = auth.uid()
        )
    GROUP BY
        p.id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

SELECT 'Função get_my_projects_details atualizada com sucesso para incluir collaborator_ids.';
