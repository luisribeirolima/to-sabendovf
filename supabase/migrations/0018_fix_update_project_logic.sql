-- Recria a função para atualizar um projeto e sincronizar sua lista de colaboradores de forma mais robusta
CREATE OR REPLACE FUNCTION public.update_project_with_collaborators(
    p_project_id uuid,
    p_name text,
    p_description text,
    p_start_date date,
    p_end_date date,
    p_budget numeric,
    p_collaborator_ids uuid[]
)
RETURNS void AS $$
BEGIN
    -- 1. Atualiza os detalhes do projeto na tabela 'projects'
    UPDATE public.projects
    SET
        name = p_name,
        description = p_description,
        start_date = p_start_date,
        end_date = p_end_date,
        budget = p_budget,
        updated_at = now()
    WHERE id = p_project_id;

    -- 2. Remove todos os colaboradores existentes do tipo 'Membro' do projeto.
    -- Isso limpa a lista para uma nova sincronização, mas preserva perfis como 'Gerente'.
    DELETE FROM public.collaborators
    WHERE project_id = p_project_id
      AND role = 'Membro';

    -- 3. Adiciona os novos colaboradores da lista, definindo-os como 'Membro'.
    -- ON CONFLICT DO NOTHING evita erros se um colaborador (como um gerente) já existir na tabela.
    INSERT INTO public.collaborators (project_id, user_id, role)
    SELECT p_project_id, unnest_id, 'Membro'::collaborator_role
    FROM unnest(p_collaborator_ids) AS unnest_id
    ON CONFLICT (project_id, user_id) DO NOTHING;

END;
$$ LANGUAGE plpgsql;

SELECT 'Função update_project_with_collaborators corrigida e atualizada com sucesso.';
