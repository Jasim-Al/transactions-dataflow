import React, { useState } from 'react';
import { Settings, Sparkles, AlertCircle, Key, Cpu, HelpCircle } from 'lucide-react';
import type { LLMConfig, DatabaseSchema } from '../types/schema';

interface SchemaGeneratorPanelProps {
  onSchemaGenerated: (schema: DatabaseSchema) => void;
  config: LLMConfig;
  setConfig: React.Dispatch<React.SetStateAction<LLMConfig>>;
}

export const SchemaGeneratorPanel: React.FC<SchemaGeneratorPanelProps> = ({ 
  onSchemaGenerated, 
  config, 
  setConfig 
}) => {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/schema/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          provider: config.provider,
          apiKey: config.apiKey,
          model: config.model,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate schema');
      }

      if (data.schema && data.schema.tables) {
        console.log("LLM Raw Response:", data.rawResponse);
        console.log("Parsed LLM Schema:", data.schema);
        onSchemaGenerated(data.schema);
      } else {
        throw new Error('Invalid schema format returned from LLM');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An unexpected error occurred. Make sure the local Ollama server is running or correct your API key.');
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
    <div className="flex flex-col h-full bg-card/40 border-r border-border backdrop-blur-md w-80 min-w-[320px] max-w-[360px] overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-border/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/20 text-primary">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-wide text-foreground">AI Schema Generator</h2>
            <p className="text-[10px] text-muted-foreground">Describe your DB or paste any dialect</p>
          </div>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`p-1.5 rounded-lg hover:bg-secondary/60 transition-colors ${
            showSettings ? 'text-primary bg-primary/10' : 'text-muted-foreground'
          }`}
          title="LLM Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="p-4 bg-secondary/30 border-b border-border/60 space-y-3.5 transition-all">
          <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-primary" />
            LLM Configurations
          </h3>

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

          {config.provider !== 'ollama' && (
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block flex items-center gap-1">
                <Key className="w-3 h-3 text-amber-500" />
                API Key
              </label>
              <input
                type="password"
                value={config.apiKey}
                onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                placeholder="Enter API Key"
                className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary transition-colors"
              />
            </div>
          )}

          {config.provider === 'ollama' && (
            <div className="p-2.5 rounded-lg bg-primary/5 border border-primary/10 text-[10px] text-muted-foreground leading-relaxed flex items-start gap-1.5">
              <HelpCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <span>
                Ensure Ollama is running locally on port 11434, and you have downloaded the <b>{config.model || 'gemma4:e4b'}</b> model.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Generation Prompt Input */}
      <form onSubmit={handleSubmit} className="p-4 flex-1 flex flex-col gap-4">
        <div className="flex-1 flex flex-col gap-2">
          <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">
            Schema Prompt / Dialect Code
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe your database in plain English (e.g. 'A SaaS subscription service with users, subscription plans, and invoices...'), or paste an existing schema definition (MongoDB Mongoose code, Prisma models, SQL tables, etc.) to convert."
            className="flex-1 w-full bg-background/50 border border-border rounded-xl p-3 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 resize-none min-h-[220px]"
          />
        </div>

        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl flex items-start gap-2 text-xs text-destructive">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-tight">{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !prompt.trim()}
          className={`w-full py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border transition-all ${
            loading || !prompt.trim()
              ? 'bg-secondary/40 border-transparent text-muted-foreground cursor-not-allowed'
              : 'bg-primary border-primary/20 text-primary-foreground hover:bg-primary/95 hover:shadow-lg hover:shadow-primary/20 cursor-pointer'
          }`}
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              Generating schema...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Generate Schema
            </>
          )}
        </button>
      </form>
    </div>
  );
};
