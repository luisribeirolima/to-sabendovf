-- CORREÇÃO DEFINITIVA: A lógica agora se baseia na posse do projeto (owner_id).
CREATE OR REPLACE FUNCTION public.get_overview_chart_data(p_project_id uuid DEFAULT NULL)
RETURNS TABLE (
    date date,
    completed_count bigint
) AS $$
DECLARE
    project_ids_to_query uuid[];
    user_role text;
    current_user_id uuid := auth.uid();
BEGIN
    -- 1. Obter o perfil do usuário
    SELECT public.get_my_role() INTO user_role;

    -- 2. Determinar os projetos relevantes com base no perfil e na posse
    IF p_project_id IS NOT NULL THEN
        -- Se um projeto específico for fornecido, usa apenas ele
        project_ids_to_query := ARRAY[p_project_id];
    ELSE
        -- Na visão consolidada:
        IF user_role = 'Admin' THEN
            -- Admin vê todos os projetos
            SELECT array_agg(id) INTO project_ids_to_query FROM public.projects;
        ELSE
            -- Gerentes e Membros veem apenas os projetos que eles possuem ou nos quais colaboram
            SELECT array_agg(DISTINCT id) INTO project_ids_to_query
            FROM (
                SELECT id FROM public.projects WHERE owner_id = current_user_id
                UNION
                SELECT project_id AS id FROM public.collaborators WHERE user_id = current_user_id
            ) AS user_projects;
        END IF;
    END IF;

    -- Se não houver projetos, retorna uma tabela vazia para evitar erros
    IF project_ids_to_query IS NULL OR array_length(project_ids_to_query, 1) IS NULL THEN
        RETURN;
    END IF;

    -- 3. Retorna a contagem de tarefas concluídas com base nos projetos filtrados
    RETURN QUERY
    SELECT
        th.changed_at::date AS date,
        COUNT(th.task_id) AS completed_count
    FROM
        public.task_history th
    JOIN
        public.tasks t ON th.task_id = t.id
    WHERE 
        t.project_id = ANY(project_ids_to_query)
        AND th.changed_field = 'status_id'
        AND th.new_value IN (SELECT ts.id::text FROM public.task_statuses ts WHERE ts.name = 'Concluído')
    GROUP BY
        th.changed_at::date
    ORDER BY
        date ASC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
