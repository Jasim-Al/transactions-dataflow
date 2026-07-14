import React, { useState } from 'react';
import { X, FileCode2, Sparkles, SlidersHorizontal, Fingerprint, HelpCircle, AlertCircle } from 'lucide-react';
import type { DatabaseSchema, LLMConfig } from '../types/schema';
import { toast } from 'sonner';


interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSchemaImported: (schema: DatabaseSchema) => void;
  config: LLMConfig;
  setConfig: React.Dispatch<React.SetStateAction<LLMConfig>>;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  onSchemaImported,
  config,
  setConfig,
}) => {
  const [drizzleCode, setDrizzleCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!drizzleCode.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/schema/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          drizzleSchema: drizzleCode.trim(),
          provider: config.provider,
          apiKey: config.apiKey,
          model: config.model,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let parsedErr = errorText;
        try {
          const parsed = JSON.parse(errorText);
          parsedErr = parsed.error || errorText;
        } catch (e) {}
        throw new Error(parsedErr || 'Failed to import schema');
      }

      const schemaObj = await response.json();

      if (schemaObj && schemaObj.tables) {
        onSchemaImported(schemaObj);
        setDrizzleCode('');
        onClose();
        toast.success("Drizzle schema imported and parsed successfully!");
      } else {
        throw new Error('Could not parse schema from the Drizzle code. Try checking the LLM output.');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An unexpected error occurred during import.');
    } finally {
      setLoading(false);
    }
  };

  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const provider = e.target.value as LLMConfig['provider'];
    let defaultModel = '';
    switch (provider) {
      case 'ollama':
        defaultModel = 'gemma4:e4b';
        break;
      case 'openai':
        defaultModel = 'gpt-4o-mini';
        break;
      case 'anthropic':
        defaultModel = 'claude-3-5-sonnet-latest';
        break;
      case 'google':
        defaultModel = 'gemini-1.5-flash';
        break;
    }
    setConfig({
      provider,
      apiKey: '',
      model: defaultModel,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div
        className="w-full max-w-3xl bg-card border border-border rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/80">
          <div className="flex items-center gap-2">
            <FileCode2 className="w-5 h-5 text-primary" />
            <h2 className="text-base font-bold text-foreground">Import Drizzle Schema</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-1.5 rounded-lg hover:bg-secondary/60 transition-colors cursor-pointer ${
                showSettings ? 'text-primary bg-primary/10' : 'text-muted-foreground'
              }`}
              title="LLM Settings"
            >
              <SlidersHorizontal className="w-4.5 h-4.5" />
            </button>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-secondary/60 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="p-4 bg-secondary/30 border-b border-border/60 grid grid-cols-3 gap-4 transition-all">
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">
                Provider
              </label>
              <select
                value={config.provider}
                onChange={handleProviderChange}
                className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary transition-colors"
              >
                <option value="ollama">Ollama (Local)</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="google">Google Gemini</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">
                Model Name
              </label>
              <input
                type="text"
                value={config.model}
                onChange={(e) => setConfig({ ...config, model: e.target.value })}
                placeholder={config.provider === 'ollama' ? 'gemma4:e4b' : 'Enter model id'}
                className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary transition-colors"
              />
            </div>

            <div className="space-y-2">
              {config.provider !== 'ollama' ? (
                <>
                  <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block flex items-center gap-1">
                    <Fingerprint className="w-3 h-3 text-amber-500" />
                    API Key
                  </label>
                  <input
                    type="password"
                    value={config.apiKey}
                    onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                    placeholder="Enter API Key"
                    className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary transition-colors"
                  />
                </>
              ) : (
                <div className="h-full flex items-center pt-5">
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 leading-normal">
                    <HelpCircle className="w-4 h-4 text-primary shrink-0" />
                    <span>Requires local Ollama at port 11434.</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Content Area */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 flex flex-col min-h-0">
          <div className="flex-1 flex flex-col gap-2">
            <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">
              Paste Drizzle Schema Code
            </label>
            <textarea
              value={drizzleCode}
              onChange={(e) => setDrizzleCode(e.target.value)}
              placeholder="Paste your schema.ts file content containing pgTable and defineRelations definitions here..."
              className="flex-1 w-full bg-background/50 border border-border rounded-xl p-3.5 font-mono text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 resize-none min-h-[300px]"
            />
          </div>

          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl flex items-start gap-2 text-xs text-destructive">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-tight">{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-border hover:bg-secondary/35 text-foreground text-xs font-semibold rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !drizzleCode.trim()}
              className={`px-5 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border transition-all ${
                loading || !drizzleCode.trim()
                  ? 'bg-secondary/40 border-transparent text-muted-foreground cursor-not-allowed'
                  : 'bg-primary border-primary/20 text-primary-foreground hover:bg-primary/95 hover:shadow-lg hover:shadow-primary/20 cursor-pointer'
              }`}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Importing and Rendering...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Import Schema
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
