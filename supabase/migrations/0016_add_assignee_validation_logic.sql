
-- Função de gatilho para verificar se o responsável pela tarefa é um colaborador do projeto
CREATE OR REPLACE FUNCTION public.check_task_assignee_is_project_collaborator()
RETURNS TRIGGER AS $$
BEGIN
    -- Se assignee_id for nulo, a tarefa não está sendo atribuída a ninguém, então a operação é permitida.
    IF NEW.assignee_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Verifica se o assignee_id existe na tabela de colaboradores para o projeto da tarefa.
    IF NOT EXISTS (
        SELECT 1
        FROM public.collaborators
        WHERE project_id = NEW.project_id AND user_id = NEW.assignee_id
    ) THEN
        RAISE EXCEPTION 'Operação falhou: O usuário selecionado como responsável não é um colaborador deste projeto.';
    END IF;

    -- Se a verificação passar, permitir a operação.
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Cria o gatilho na tabela 'tasks'
DROP TRIGGER IF EXISTS trigger_validate_task_assignee ON public.tasks;
CREATE TRIGGER trigger_validate_task_assignee
BEFORE INSERT OR UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.check_task_assignee_is_project_collaborator();

SELECT 'Gatilho de validação de responsável pela tarefa criado com sucesso.';
