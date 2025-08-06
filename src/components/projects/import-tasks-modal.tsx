"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import Papa from "papaparse";
import { useTableSettings } from "@/hooks/use-table-settings";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

interface ImportTasksModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onImportSuccess: () => void; // Adicionar o callback de sucesso
  projectId: string | null;
}

const STAGE_SELECT_FILE = 1;
const STAGE_MAP_COLUMNS = 2;
const STAGE_IMPORTING = 3;

export default function ImportTasksModal({ 
  isOpen, 
  onOpenChange, 
  onImportSuccess,
  projectId 
}: ImportTasksModalProps) {
  const [stage, setStage] = useState(STAGE_SELECT_FILE);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<{ [key: string]: string }>({});
  const { columns } = useTableSettings();
  const { toast } = useToast();

  const systemFields = [
    { id: 'name', name: 'Nome da Tarefa' },
    { id: 'description', name: 'Descrição' },
    { id: 'assignee_id', name: 'Responsável (Nome)' },
    { id: 'status_id', name: 'Status (Nome)' },
    { id: 'priority', name: 'Prioridade' },
    { id: 'start_date', name: 'Data de Início (YYYY-MM-DD)' },
    { id: 'end_date', name: 'Data de Fim (YYYY-MM-DD)' },
    { id: 'progress', name: 'Progresso (0-100)' },
    ...columns.filter(c => c.id.startsWith('custom_')).map(c => ({ id: c.id, name: c.name }))
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      Papa.parse(selectedFile, {
        header: true,
        preview: 1,
        complete: (results) => {
          setHeaders(results.meta.fields || []);
          setMappings(Object.fromEntries((results.meta.fields || []).map(h => [h, 'ignore'])));
        },
      });
    }
  };
  
  const handleImport = async () => {
    if (!file || !projectId) return;
    setStage(STAGE_IMPORTING);
    try {
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('tosabendo2')
        .upload(`imports/${projectId}-${Date.now()}-${file.name}`, file);
      if (uploadError) throw uploadError;

      const { data, error } = await supabase.functions.invoke('import-tasks', {
        body: { filePath: uploadData.path, projectId, mappings },
      });
      if (error) throw error;

      toast({ title: "Sucesso!", description: data.message });
      onImportSuccess(); // Chamar o callback para atualizar a tabela
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Erro na Importação", description: err.message, variant: "destructive" });
    } finally {
      setStage(STAGE_SELECT_FILE); // Reset stage
    }
  };

  const renderContent = () => {
    switch (stage) {
      case STAGE_SELECT_FILE:
        return (
          <div>
            <label htmlFor="csv-file" className="block text-sm font-medium text-gray-700">Selecione o arquivo CSV</label>
            <Input id="csv-file" type="file" accept=".csv" onChange={handleFileChange} className="mt-1"/>
            <p className="mt-2 text-sm text-gray-500">O arquivo deve conter um cabeçalho. Na próxima etapa, você irá mapear as colunas.</p>
          </div>
        );
      case STAGE_MAP_COLUMNS:
        return (
          <div>
            <h3 className="text-lg font-medium">Mapear Colunas</h3>
            <p className="text-sm text-muted-foreground mb-4">Combine as colunas do seu arquivo CSV com os campos do sistema.</p>
            <div className="space-y-4 max-h-64 overflow-y-auto">
              {headers.map(header => (
                <div key={header} className="grid grid-cols-2 gap-4 items-center">
                  <span className="font-semibold">{header}</span>
                  <Select value={mappings[header]} onValueChange={value => setMappings(prev => ({ ...prev, [header]: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ignore">Ignorar</SelectItem>
                      {systemFields.map(field => <SelectItem key={field.id} value={field.id}>{field.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        );
      case STAGE_IMPORTING:
        return <div className="text-center">Importando...</div>;
      default:
        return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar Tarefas de CSV</DialogTitle>
          <DialogDescription>Siga os passos para importar suas tarefas.</DialogDescription>
        </DialogHeader>
        <div className="py-4">{renderContent()}</div>
        <DialogFooter>
          {stage === STAGE_SELECT_FILE && <Button onClick={() => setStage(STAGE_MAP_COLUMNS)} disabled={!file}>Próximo</Button>}
          {stage === STAGE_MAP_COLUMNS && <Button onClick={handleImport}>Confirmar e Importar</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
