-- CORREÇÃO DEFINITIVA: A lógica agora se baseia na posse do projeto (owner_id).
CREATE OR REPLACE FUNCTION public.get_dashboard_kpis(p_project_id uuid DEFAULT NULL)
RETURNS jsonb AS $$
DECLARE
    kpis jsonb;
    project_ids_to_query uuid[];
    user_role text;
    current_user_id uuid := auth.uid();
BEGIN
    -- 1. Obter o perfil do usuário
    SELECT public.get_my_role() INTO user_role;

    -- 2. Determinar os projetos relevantes com base no perfil e na posse
    IF p_project_id IS NOT NULL THEN
        -- Se um projeto específico for fornecido, usa apenas ele
        -- (com uma verificação de segurança futura, se necessário)
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

    -- Se não houver projetos, retorna um objeto JSON vazio
    IF project_ids_to_query IS NULL OR array_length(project_ids_to_query, 1) IS NULL THEN
        RETURN '{}'::jsonb;
    END IF;

    -- 3. Calcula todos os KPIs com base nos projetos filtrados
    SELECT jsonb_build_object(
        'total_budget', COALESCE(SUM(p.budget), 0),
        'total_projects', COUNT(DISTINCT t.project_id),
        'total_tasks', COUNT(t.id),
        'completed_tasks', COUNT(t.id) FILTER (WHERE ts.name = 'Concluído'),
        'tasks_at_risk', COUNT(t.id) FILTER (WHERE ts.name <> 'Concluído' AND t.end_date < CURRENT_DATE),
        'overall_progress', COALESCE(AVG(t.progress), 0)
    )
    INTO kpis
    FROM public.tasks t
    JOIN public.projects p ON t.project_id = p.id
    LEFT JOIN public.task_statuses ts ON t.status_id = ts.id
    WHERE t.project_id = ANY(project_ids_to_query);

    RETURN kpis;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
