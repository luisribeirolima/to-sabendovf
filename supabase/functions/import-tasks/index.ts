import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Papa from "https://esm.sh/papaparse";

console.log("INFO: Function `import-tasks` (v4-simplified-insert) is initializing.");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { filePath, projectId, mappings } = await req.json();
    
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Buscas em paralelo para otimização
    const [ userResults, statusResults, downloadResults ] = await Promise.all([
        supabaseAdmin.from('profiles').select('id, name'),
        supabaseAdmin.from('task_statuses').select('id, name'),
        supabaseAdmin.storage.from('tosabendo2').download(filePath)
    ]);

    const { data: users, error: userError } = userResults;
    if (userError) throw userError;
    const userMap = new Map(users.map((u) => [u.name, u.id]));

    const { data: statuses, error: statusError } = statusResults;
    if (statusError) throw statusError;
    const statusMap = new Map(statuses.map((s) => [s.name, s.id]));
    
    const { data: fileData, error: downloadError } = downloadResults;
    if (downloadError) throw downloadError;

    const fileContent = await fileData.text();
    const parseResult = Papa.parse(fileContent, {
      header: true,
      skipEmptyLines: true,
    });

    if (parseResult.errors.length > 0) {
      throw new Error(`Erro ao analisar o CSV: ${parseResult.errors.map(e => e.message).join(', ')}`);
    }

    const tasksToInsert = parseResult.data.map((row: any) => {
      const task: { [key: string]: any } = { project_id: projectId, custom_fields: {} };
      for (const csvHeader in mappings) {
        const systemField = mappings[csvHeader];
        const value = row[csvHeader];
        if (systemField === 'ignore' || !value) continue;
        if (systemField === 'assignee_id') {
          const assigneeId = userMap.get(value);
          if (assigneeId) task.assignee_id = assigneeId;
        } else if (systemField === 'status_id') {
          const statusId = statusMap.get(value);
          if (statusId) task.status_id = statusId;
        } else if (systemField.startsWith('custom_')) {
          task.custom_fields[systemField] = value;
        } else {
          task[systemField] = value;
        }
      }
      return task;
    }).filter(task => task.name && task.status_id);
    
    if (tasksToInsert.length > 0) {
      // Revertido para um 'insert' simples, pois a restrição de unicidade foi removida.
      const { error: insertError } = await supabaseAdmin
        .from('tasks')
        .insert(tasksToInsert);

      if (insertError) throw insertError;
    }

    await supabaseAdmin.storage.from('tosabendo2').remove([filePath]);

    return new Response(JSON.stringify({ message: `${tasksToInsert.length} tarefas importadas com sucesso.` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("FATAL:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
