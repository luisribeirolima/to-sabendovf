"use client";
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import type { Project } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

// Tipos
type ProjectUpdateData = Partial<Project> & { collaborator_ids?: string[] };
type NewProjectData = Omit<Project, 'id' | 'created_at'> & { collaborator_ids?: string[] };

interface ProjectsContextType {
  projects: Project[];
  loading: boolean;
  refetchProjects: () => void;
  addProject: (project: NewProjectData) => Promise<void>;
  updateProject: (id: string, updates: ProjectUpdateData) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
}

const ProjectsContext = createContext<ProjectsContextType | undefined>(undefined);

export const ProjectsProvider = ({ children }: { children: ReactNode }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const { toast } = useToast();

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_my_projects_details');
    if (error) {
      toast({ title: "Erro ao carregar projetos", description: error.message, variant: "destructive" });
    } else {
      setProjects(data || []);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const addProject = async (project: NewProjectData) => {
    // CORREÇÃO: Chama a nova função 'create_project' que define o owner_id
    const { collaborator_ids, ...projectData } = project;
    const { data, error } = await supabase.rpc('create_project', {
      p_name: projectData.name,
      p_description: projectData.description,
      p_start_date: projectData.start_date,
      p_end_date: projectData.end_date,
      p_budget: projectData.budget
    });

    if (error) { 
      toast({ title: "Erro ao criar projeto", description: error.message, variant: "destructive" }); 
    } else { 
      // Se a criação for bem-sucedida e houver colaboradores para adicionar
      if (collaborator_ids && collaborator_ids.length > 0) {
        const newProjectId = data.id;
        const { error: collabError } = await supabase.rpc('update_project_with_collaborators', {
          p_project_id: newProjectId,
          p_name: projectData.name,
          p_description: projectData.description,
          p_start_date: projectData.start_date,
          p_end_date: projectData.end_date,
          p_budget: projectData.budget,
          p_collaborator_ids: collaborator_ids,
        });
        if (collabError) {
          toast({ title: "Projeto criado, mas houve um erro ao adicionar colaboradores", description: collabError.message, variant: "destructive" });
        } else {
          toast({ title: "Projeto e colaboradores adicionados com sucesso!" });
        }
      } else {
        toast({ title: "Projeto criado com sucesso!" });
      }
      fetchProjects(); 
    }
  };

  const updateProject = async (id: string, updates: ProjectUpdateData) => {
    const { collaborator_ids, ...projectData } = updates;
    const { error } = await supabase.rpc('update_project_with_collaborators', {
        p_project_id: id,
        p_name: projectData.name,
        p_description: projectData.description,
        p_start_date: projectData.start_date,
        p_end_date: projectData.end_date,
        p_budget: projectData.budget,
        p_collaborator_ids: collaborator_ids || [],
    });
    if (error) { toast({ title: "Erro ao atualizar projeto", description: error.message, variant: "destructive" }); } 
    else { toast({ title: "Projeto atualizado com sucesso!" }); fetchProjects(); }
  };

  const deleteProject = async (id: string) => {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) { toast({ title: "Erro ao excluir projeto", description: error.message, variant: "destructive" }); } 
    else { toast({ title: "Projeto excluído com sucesso!" }); fetchProjects(); }
  };

  return (
    <ProjectsContext.Provider value={{ projects, loading, refetchProjects: fetchProjects, addProject, updateProject, deleteProject }}>
      {children}
    </ProjectsContext.Provider>
  );
};

export const useProjects = () => {
  const context = useContext(ProjectsContext);
  if (context === undefined) {
    throw new Error("useProjects must be used within a ProjectsProvider");
  }
  return context;
};
