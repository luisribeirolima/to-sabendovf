-- Migration 0021: Add Project Owner and Update BI Logic
-- 1. Adds an 'owner_id' to the projects table to explicitly define who manages the project.
-- 2. Creates a function to ensure the owner is set upon project creation.
-- 3. Backfills owner_id for existing projects to ensure data consistency.

-- Etapa 1: Adicionar a coluna de 'dono' do projeto
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Etapa 2: Script de Backfill para projetos existentes
-- Atribui a posse ao primeiro colaborador com a função 'Gerente' encontrado.
-- Se nenhum gerente for encontrado, atribui ao primeiro colaborador encontrado.
DO $$
DECLARE
    proj RECORD;
    owner_candidate_id uuid;
BEGIN
    FOR proj IN SELECT id FROM public.projects WHERE owner_id IS NULL LOOP
        -- Prioriza o primeiro 'Gerente' como dono
        SELECT user_id INTO owner_candidate_id
        FROM public.collaborators
        WHERE project_id = proj.id AND role = 'Gerente'
        ORDER BY id
        LIMIT 1;

        -- Se não houver gerente, pega o primeiro colaborador
        IF owner_candidate_id IS NULL THEN
            SELECT user_id INTO owner_candidate_id
            FROM public.collaborators
            WHERE project_id = proj.id
            ORDER BY id
            LIMIT 1;
        END IF;

        -- Atualiza o projeto com o dono encontrado
        IF owner_candidate_id IS NOT NULL THEN
            UPDATE public.projects SET owner_id = owner_candidate_id WHERE id = proj.id;
        END IF;
    END LOOP;
END $$;


-- Etapa 3: Função para criar projeto e definir o dono
CREATE OR REPLACE FUNCTION public.create_project(
    p_name text,
    p_description text DEFAULT NULL,
    p_start_date date DEFAULT NULL,
    p_end_date date DEFAULT NULL,
    p_budget numeric DEFAULT NULL
)
RETURNS json
AS $$
DECLARE
    new_project_id uuid;
    new_project json;
BEGIN
    -- Insere o projeto e define o usuário atual como o dono
    INSERT INTO public.projects (name, description, start_date, end_date, budget, owner_id)
    VALUES (p_name, p_description, p_start_date, p_end_date, p_budget, auth.uid())
    RETURNING id INTO new_project_id;

    -- Adiciona o dono como um colaborador 'Gerente' para manter a consistência
    INSERT INTO public.collaborators (project_id, user_id, role)
    VALUES (new_project_id, auth.uid(), 'Gerente');

    -- Retorna os detalhes do projeto recém-criado
    SELECT json_build_object('id', p.id, 'name', p.name, 'description', p.description, 'start_date', p.start_date, 'end_date', p.end_date, 'budget', p.budget, 'created_at', p.created_at)
    INTO new_project
    FROM public.projects p
    WHERE p.id = new_project_id;

    RETURN new_project;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
