import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import Papa from "https://esm.sh/papaparse@5.3.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { projectId } = await req.json(); // Can be a project UUID or 'consolidated'
    if (!projectId) {
      throw new Error("ID do projeto é obrigatório.");
    }

    const isConsolidated = projectId === 'consolidated';

    // Create a client with the user's JWT to verify permissions
    const userSupabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );
    
    const { data: { user } } = await userSupabaseClient.auth.getUser();
    if (!user) {
      throw new Error("Usuário não autenticado.");
    }

    // Create an admin client for data fetching
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    let tasksQuery;

    if (isConsolidated) {
      const { data: role } = await userSupabaseClient.rpc('get_my_role');
      
      if (role === 'Admin') {
        tasksQuery = supabaseAdmin.from("tasks").select('*');
      } else {
        const { data: projects, error: projError } = await supabaseAdmin
          .from('collaborators')
          .select('project_id')
          .eq('user_id', user.id);

        if (projError) throw projError;
        const projectIds = projects.map(p => p.project_id);
        
        if (projectIds.length === 0) {
          tasksQuery = Promise.resolve({ data: [], error: null });
        } else {
          tasksQuery = supabaseAdmin.from("tasks").select('*').in('project_id', projectIds);
        }
      }
    } else {
      tasksQuery = supabaseAdmin.from("tasks").select('*').eq("project_id", projectId);
    }
    
    const [
        { data: tasks, error: tasksError },
        { data: statuses, error: statusesError },
        { data: profiles, error: profilesError },
        { data: allProjects, error: projectsError }
    ] = await Promise.all([
        tasksQuery,
        supabaseAdmin.from("task_statuses").select("id, name"),
        supabaseAdmin.from("profiles").select("id, name"),
        isConsolidated ? supabaseAdmin.from("projects").select("id, name") : Promise.resolve({data: [], error: null})
    ]);

    if (tasksError) throw new Error(`Erro ao buscar tarefas: ${tasksError.message}`);
    if (statusesError) throw new Error(`Erro ao buscar status: ${statusesError.message}`);
    if (profilesError) throw new Error(`Erro ao buscar perfis: ${profilesError.message}`);
    if (projectsError) throw new Error(`Erro ao buscar projetos: ${projectsError.message}`);

    if (!tasks || tasks.length === 0) {
      return new Response("", {
          headers: { ...corsHeaders, "Content-Type": "text/csv;charset=utf-8;", "Content-Disposition": `attachment; filename="export_${projectId}_empty.csv"` },
          status: 200,
      });
    }

    const statusMap = new Map(statuses.map(s => [s.id, s.name]));
    const assigneeMap = new Map(profiles.map(p => [p.id, p.name]));
    const projectMap = isConsolidated ? new Map(allProjects.map(p => [p.id, p.name])) : new Map();

    const tasksToExport = tasks.map(task => {
        const exportTask: { [key: string]: any } = {
            'ID': task.formatted_id || 'N/A',
            'Nome': task.name,
            'Descrição': task.description,
            'Status': statusMap.get(task.status_id) || 'Desconhecido',
            'Responsável': task.assignee_id ? (assigneeMap.get(task.assignee_id) || 'Desconhecido') : 'N/A',
            'Prioridade': task.priority,
            'Progresso (%)': task.progress,
            'Data de Início': task.start_date,
            'Data de Fim': task.end_date,
        };
        if (isConsolidated) {
            exportTask['Projeto'] = projectMap.get(task.project_id) || 'Desconhecido';
        }
        return exportTask;
    });

    const columns = ['ID', 'Nome', 'Descrição', 'Status', 'Responsável', 'Prioridade', 'Progresso (%)', 'Data de Início', 'Data de Fim'];
    if (isConsolidated) {
        columns.unshift('Projeto'); // Add 'Projeto' to the beginning of the columns array
    }

    const csv = Papa.unparse(tasksToExport, { columns });

    const filename = isConsolidated ? `export_consolidado_${Date.now()}.csv` : `export_project_${projectId}.csv`;

    return new Response(csv, {
      headers: { ...corsHeaders, "Content-Type": "text/csv;charset=utf-8;", "Content-Disposition": `attachment; filename="${filename}"` },
      status: 200,
    });

  } catch (error) {
    console.error("Erro fatal na função export-tasks:", error.message);
    return new Response(JSON.stringify({ error: `Erro interno no servidor: ${error.message}` }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }});
  }
});
