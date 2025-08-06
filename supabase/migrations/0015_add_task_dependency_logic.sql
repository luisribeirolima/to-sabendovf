
-- 1. Função para validar que as dependências pertencem ao mesmo projeto

CREATE OR REPLACE FUNCTION public.check_task_dependencies_on_insert_or_update()
RETURNS TRIGGER AS $$
DECLARE
    task_project_id uuid;
    dependency_project_id uuid;
BEGIN
    -- Obter o project_id da tarefa principal
    SELECT project_id INTO task_project_id FROM public.tasks WHERE id = NEW.task_id;

    -- Obter o project_id da tarefa de dependência
    SELECT project_id INTO dependency_project_id FROM public.tasks WHERE id = NEW.dependency_id;

    -- Verificar se os projetos são os mesmos
    IF task_project_id IS DISTINCT FROM dependency_project_id THEN
        RAISE EXCEPTION 'Restrição violada: Uma tarefa só pode depender de tarefas do mesmo projeto.';
    END IF;

    -- Se a verificação passar, permitir a operação
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Cria o gatilho que usa a função acima
DROP TRIGGER IF EXISTS trigger_check_task_dependencies ON public.task_dependencies;
CREATE TRIGGER trigger_check_task_dependencies
BEFORE INSERT OR UPDATE ON public.task_dependencies
FOR EACH ROW
EXECUTE FUNCTION public.check_task_dependencies_on_insert_or_update();

-- 2. Função para ajustar as datas de tarefas dependentes automaticamente

CREATE OR REPLACE FUNCTION public.adjust_dependent_task_dates()
RETURNS TRIGGER AS $$
DECLARE
    dependent_task RECORD;
    duration INTERVAL;
BEGIN
    -- Continuar apenas se a data de término realmente mudou e não é nula
    IF TG_OP = 'UPDATE' AND NEW.end_date IS NOT NULL AND NEW.end_date IS DISTINCT FROM OLD.end_date THEN

        -- Iterar sobre todas as tarefas que dependem da tarefa atualizada
        FOR dependent_task IN
            SELECT td.task_id, t.start_date, t.end_date
            FROM public.task_dependencies td
            JOIN public.tasks t ON td.task_id = t.id
            WHERE td.dependency_id = NEW.id
        LOOP
            -- Ajustar apenas se a data de início da tarefa dependente for anterior à nova data de término
            IF dependent_task.start_date IS NULL OR dependent_task.start_date < NEW.end_date + INTERVAL '1 day' THEN
                
                -- Calcular a duração original da tarefa dependente
                IF dependent_task.start_date IS NOT NULL AND dependent_task.end_date IS NOT NULL THEN
                    duration := dependent_task.end_date - dependent_task.start_date;
                ELSE
                    duration := INTERVAL '0 day'; -- Duração padrão se as datas não estiverem definidas
                END IF;

                -- Atualizar as datas de início e término da tarefa dependente
                UPDATE public.tasks
                SET
                    start_date = NEW.end_date + INTERVAL '1 day',
                    end_date = NEW.end_date + INTERVAL '1 day' + duration
                WHERE id = dependent_task.task_id;
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Cria o gatilho que usa a função de ajuste de datas
DROP TRIGGER IF EXISTS trigger_adjust_dependent_dates ON public.tasks;
CREATE TRIGGER trigger_adjust_dependent_dates
AFTER UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.adjust_dependent_task_dates();
