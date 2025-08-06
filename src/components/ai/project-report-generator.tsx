
"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { useReactToPrint } from "react-to-print";
import { generateProjectReport, type GenerateProjectReportOutput } from "@/ai/flows/project-report-generator";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, FileText, Printer, BarChart, DollarSign, ListTodo, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import OverviewChart from "../dashboard/overview-chart";
import KpiCard from "../dashboard/kpi-card";
import ProjectSelector from "../shared/project-selector";
import { useTasks } from "@/hooks/use-tasks";
import { supabase } from "@/lib/supabase";
import type { Project } from "@/lib/types";
import { differenceInDays, isAfter } from "date-fns";


export default function ProjectReportGenerator() {
  const [selectedProject, setSelectedProject] = useState("consolidated");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateProjectReportOutput | null>(null);
  const { toast } = useToast();
  const reportRef = useRef<HTMLDivElement>(null);
  const { tasks } = useTasks();
  const [projects, setProjects] = useState<Project[]>([]);
  const userRole = 'manager';

  useEffect(() => {
    const fetchProjects = async () => {
        const { data, error } = await supabase.from('projects').select('*');
        if (error) console.error("Error fetching projects", error);
        else setProjects(data || []);
    };
    fetchProjects();
  }, []);

  const handlePrint = useReactToPrint({
    content: () => reportRef.current,
    documentTitle: `Relatorio-${selectedProject.replace(" ", "-")}-${new Date().toISOString().slice(0, 10)}`,
  });
  
  const currentKpis = useMemo(() => {
    const relevantProjects = selectedProject === 'consolidated' 
        ? projects 
        : projects.filter(p => p.name === selectedProject);
    
    const relevantTasks = selectedProject === 'consolidated'
        ? tasks
        : tasks.filter(t => t.project === selectedProject);

    if (relevantProjects.length === 0) return { budget: "N/A", tasks: "N/A", risk: "N/A", completion: "N/A", taskHistory: "", overviewChartData: "" };

    const totalBudget = relevantProjects.reduce((sum, p) => sum + p.budget, 0);
    const spentBudget = relevantProjects.reduce((sum, p) => sum + p.spent, 0);

    const completedTasks = relevantTasks.filter(t => t.status === 'Feito');
    const overdueTasks = relevantTasks.filter(t => t.status !== 'Feito' && isAfter(new Date(), new Date(t.end)));
    const riskValue = overdueTasks.length > relevantTasks.length * 0.2 ? 'Alto' : overdueTasks.length > 0 ? 'Médio' : 'Baixo';
    
    let avgCompletionDays = 0;
    if (completedTasks.length > 0) {
        const totalCompletionDays = completedTasks.reduce((acc, task) => {
            const days = differenceInDays(new Date(task.end), new Date(task.start));
            return acc + (days >= 0 ? days : 0);
        }, 0);
        avgCompletionDays = totalCompletionDays / completedTasks.length;
    }
    
    const taskHistorySummary = `Resumo de Tarefas: ${relevantTasks.length} total. ${completedTasks.length} concluídas, ${overdueTasks.length} atrasadas.`;
    
    const overviewChartDataSummary = `Dados do gráfico mostram a tendência de tarefas concluídas vs. pendentes ao longo do tempo.`;

    return {
        budget: `$${spentBudget.toLocaleString('pt-BR')} / $${totalBudget.toLocaleString('pt-BR')}`,
        tasks: `${completedTasks.length} / ${relevantTasks.length}`,
        risk: riskValue,
        completion: `${avgCompletionDays.toFixed(1)} dias`,
        taskHistory: taskHistorySummary,
        overviewChartData: overviewChartDataSummary
    }

  }, [selectedProject, tasks, projects]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const response = await generateProjectReport({
        projectName: selectedProject === "consolidated" ? "Visão Consolidada" : selectedProject,
        kpis: JSON.stringify({
            budget: currentKpis.budget,
            tasks: currentKpis.tasks,
            risk: currentKpis.risk,
            completion: currentKpis.completion
        }),
        taskHistory: currentKpis.taskHistory,
        overviewChartData: currentKpis.overviewChartData
      });
      setResult(response);
    } catch (error) {
      console.error("AI Report Generation Error:", error);
      toast({
        title: "Erro",
        description: "Não foi possível gerar o relatório. Por favor, tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <form onSubmit={handleSubmit}>
        <CardHeader>
          <CardTitle>Gerador de Relatório de Projeto</CardTitle>
          <CardDescription>
            Selecione um projeto para gerar um relatório abrangente usando IA. O relatório incluirá KPIs, análise de tarefas e recomendações.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="project-select">Escopo do Relatório</Label>
            <ProjectSelector
                value={selectedProject}
                onValueChange={(val) => {
                    setSelectedProject(val);
                    setResult(null);
                }}
                userRole={userRole}
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            Gerar Relatório
          </Button>
        </CardFooter>
      </form>

      {result && (
        <div className="p-6 pt-0">
          <div className="flex justify-between items-center mb-4">
             <h3 className="text-lg font-semibold">Resultado Gerado por IA</h3>
             <Button onClick={handlePrint} variant="outline">
                <Printer className="mr-2 h-4 w-4" />
                Imprimir / Exportar PDF
             </Button>
          </div>
         
          <div ref={reportRef} className="p-8 print-container">
            <style type="text/css" media="print">
              {`
                @page { size: auto; margin: 20mm; }
                body { -webkit-print-color-adjust: exact; }
                .print-container { padding: 0 !important; }
                .no-print { display: none; }
              `}
            </style>
            <div className="space-y-6">
                <div className="text-center space-y-2">
                    <h1 className="text-3xl font-bold">{result.reportTitle}</h1>
                    <p className="text-muted-foreground">Data do Relatório: {new Date().toLocaleDateString('pt-BR')}</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <KpiCard title="Orçamento" value={currentKpis.budget} change="" icon={<DollarSign />} />
                    <KpiCard title="Tarefas Concluídas" value={currentKpis.tasks} change="" icon={<ListTodo />} />
                    <KpiCard title="Risco do Projeto" value={currentKpis.risk} change="" icon={<Zap />} />
                    <KpiCard title="Média de Conclusão" value={currentKpis.completion} change="" icon={<BarChart />} />
                </div>
                 <div className="grid grid-cols-1 lg:grid-cols-7 gap-4">
                    <div className="lg:col-span-4">
                        <OverviewChart selectedProject={selectedProject} userRole={userRole}/>
                    </div>
                    <div className="lg:col-span-3 space-y-4">
                        <Card>
                            <CardHeader><CardTitle>Sumário Executivo</CardTitle></CardHeader>
                            <CardContent><p className="text-sm">{result.executiveSummary}</p></CardContent>
                        </Card>
                         <Card>
                            <CardHeader><CardTitle>Análise dos KPIs</CardTitle></CardHeader>
                            <CardContent><p className="text-sm">{result.kpiAnalysis}</p></CardContent>
                        </Card>
                    </div>
                </div>
                <Card>
                    <CardHeader><CardTitle>Análise das Tarefas</CardTitle></CardHeader>
                    <CardContent><p className="text-sm">{result.taskAnalysis}</p></CardContent>
                </Card>
                 <Card>
                    <CardHeader><CardTitle>Análise do Gráfico</CardTitle></CardHeader>
                    <CardContent><p className="text-sm">{result.chartInsight}</p></CardContent>
                </Card>
                 <Card className="bg-amber-50 border-amber-200">
                    <CardHeader><CardTitle>Recomendações</CardTitle></CardHeader>
                    <CardContent><p className="text-sm font-medium text-amber-900">{result.recommendations}</p></CardContent>
                </Card>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
