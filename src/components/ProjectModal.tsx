import React, { useEffect, useState } from 'react';
import { X, FolderOpen, Plus, Trash2, Calendar, Database, Download, FileUp } from 'lucide-react';
import type { ProjectMetadata } from '../types/project';
import { toast } from 'sonner';


interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadProject: (id: string) => Promise<void>;
  onCreateProject: (name: string) => Promise<void>;
}

export const ProjectModal: React.FC<ProjectModalProps> = ({
  isOpen,
  onClose,
  onLoadProject,
  onCreateProject,
}) => {
  const [projects, setProjects] = useState<ProjectMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/projects');
      if (!res.ok) throw new Error('Failed to fetch projects');
      const data = await res.json();
      setProjects(data);
    } catch (err: any) {
      setError(err.message || 'An error occurred while loading projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchProjects();
    }
  }, [isOpen]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await onCreateProject(newProjectName.trim());
      setNewProjectName('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this project?')) return;
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete project');
      fetchProjects();
    } catch (err: any) {
      setError(err.message || 'Failed to delete project');
    }
  };

  const handleLoad = async (id: string) => {
    try {
      await onLoadProject(id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to load project');
    }
  };
  
  const handleExport = async (proj: ProjectMetadata, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/projects/${proj.id}`);
      if (!res.ok) throw new Error('Failed to fetch project');
      const data = await res.json();
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${proj.name.toLowerCase().replace(/\s+/g, '_')}_project.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success(`Project "${proj.name}" exported successfully!`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to export project');
    }
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result;
        if (typeof text !== 'string') throw new Error('Failed to read file content');
        
        const projectData = JSON.parse(text);
        if (!projectData.name || !projectData.schema) {
          throw new Error('Invalid project file structure. Must contain name and schema.');
        }

        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: projectData.name,
            schema: projectData.schema,
            nodes: projectData.nodes || [],
            edges: projectData.edges || [],
          })
        });

        if (!res.ok) throw new Error('Failed to save imported project');
        
        fetchProjects();
        toast.success(`Project "${projectData.name}" imported successfully!`);
      } catch (err: any) {
        toast.error(err.message || 'Failed to parse project file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };


  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div
        className="w-full max-w-2xl bg-card border border-border rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/80">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-primary" />
            <h2 className="text-base font-bold text-foreground">Project Manager</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-secondary/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-xs text-destructive">
              {error}
            </div>
          )}

          {/* Create New Project Form */}
          <div className="p-4 bg-secondary/35 rounded-xl border border-border/50 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
                <FolderOpen className="w-4 h-4 text-primary" />
                Manage Projects
              </h3>
              <label className="flex items-center gap-1 px-3 py-1.5 bg-secondary hover:bg-secondary/80 border border-border rounded-lg text-xs font-semibold text-foreground cursor-pointer transition-all">
                <FileUp className="w-3.5 h-3.5 text-indigo-400" />
                Import Project File
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportFileChange}
                  className="hidden"
                />
              </label>
            </div>
            
            <form onSubmit={handleCreate} className="flex gap-2">
              <input
                type="text"
                placeholder="New Project Name (e.g. SaaS Billing)"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary transition-colors"
                disabled={creating}
              />
              <button
                type="submit"
                disabled={creating || !newProjectName.trim()}
                className="px-4 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/95 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-3.5 h-3.5" />
                Create
              </button>
            </form>
          </div>


          {/* Projects List */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
              Saved Projects
            </h3>
            {loading ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground text-xs gap-2">
                <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                Loading projects...
              </div>
            ) : projects.length === 0 ? (
              <div className="text-center py-10 text-xs text-muted-foreground italic border border-dashed border-border rounded-xl">
                No projects saved yet. Create one above to persist your schema!
              </div>
            ) : (
              <div className="grid gap-2">
                {projects.map((proj) => (
                  <div
                    key={proj.id}
                    onClick={() => handleLoad(proj.id)}
                    className="flex items-center justify-between p-3.5 bg-secondary/20 hover:bg-secondary/40 border border-border/60 hover:border-primary/40 rounded-xl cursor-pointer transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg text-primary group-hover:scale-105 transition-transform">
                        <Database className="w-4 h-4" />
                      </div>
                      <div className="text-left">
                        <h4 className="text-xs font-bold text-foreground">{proj.name}</h4>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(proj.updatedAt).toLocaleDateString()}
                          </span>
                          <span>•</span>
                          <span>{proj.tablesCount} {proj.tablesCount === 1 ? 'table' : 'tables'}</span>
                          <span>•</span>
                          <span>{proj.relationsCount} {proj.relationsCount === 1 ? 'relation' : 'relations'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => handleExport(proj, e)}
                        className="p-2 bg-secondary/85 text-foreground hover:bg-secondary border border-border hover:border-muted-foreground rounded-lg opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                        title="Export Project"
                      >
                        <Download className="w-3.5 h-3.5 text-primary" />
                      </button>
                      <button
                        onClick={(e) => handleDelete(proj.id, e)}
                        className="p-2 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground transition-all cursor-pointer"
                        title="Delete Project"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
