-- Versão Definitiva
-- Corrige o problema da exportação ao permitir que operações do sistema (service_role) funcionem.
CREATE OR REPLACE FUNCTION public.can_interact_with_task_file(p_file_path text)
RETURNS boolean AS $function$
DECLARE
    path_parts text[];
    project_id_from_path uuid;
    task_id_from_path uuid;
    has_permission boolean := false;
    user_role text;
BEGIN
    -- As funções que usam a SERVICE_ROLE_KEY (como a de exportação) não têm um usuário
    -- autenticado (`auth.uid()` é nulo). Esta verificação permite que essas operações
    -- de back-end sempre funcionem, contornando as regras de usuário abaixo.
    IF auth.uid() IS NULL THEN
        RETURN TRUE;
    END IF;

    -- A partir daqui, a lógica só se aplica a operações feitas por usuários autenticados.
    SELECT public.get_my_role() INTO user_role;

    -- Admins e Gerentes têm permissão.
    IF user_role IN ('Admin', 'Gerente') THEN
        RETURN TRUE;
    END IF;

    -- Se o usuário não for Admin/Gerente, verificamos se é um colaborador no projeto.
    path_parts := string_to_array(p_file_path, '/');

    -- CASO 1: Arquivo de importação/exportação.
    IF path_parts[1] = 'imports' OR path_parts[1] = 'exports' THEN
        BEGIN
            project_id_from_path := substring(path_parts[2] from '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})');
        EXCEPTION WHEN others THEN RETURN FALSE; END;

        IF project_id_from_path IS NULL THEN RETURN FALSE; END IF;

        SELECT EXISTS (
            SELECT 1 FROM public.collaborators c
            WHERE c.project_id = project_id_from_path AND c.user_id = auth.uid()
        ) INTO has_permission;

    -- CASO 2: Anexo de tarefa.
    ELSIF array_length(path_parts, 1) >= 3 THEN
        BEGIN
            task_id_from_path := path_parts[3]::uuid;
        EXCEPTION WHEN others THEN RETURN FALSE; END;

        SELECT EXISTS (
            SELECT 1 FROM public.tasks t
            JOIN public.collaborators c ON t.project_id = c.project_id
            WHERE t.id = task_id_from_path AND c.user_id = auth.uid()
        ) INTO has_permission;
    END IF;

    RETURN has_permission;

END;
$function$ LANGUAGE plpgsql SECURITY DEFINER;
