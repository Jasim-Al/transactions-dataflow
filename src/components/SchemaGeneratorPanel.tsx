import React, { useState } from 'react';
import { SlidersHorizontal, Sparkles, AlertCircle, Fingerprint, BrainCircuit, HelpCircle, ChevronUp, ChevronDown, Database } from 'lucide-react';
import type { LLMConfig, DatabaseSchema } from '../types/schema';
import { toast } from 'sonner';


interface SchemaGeneratorPanelProps {
  currentSchema: DatabaseSchema;
  onSchemaGenerated: (schema: DatabaseSchema) => void;
  config: LLMConfig;
  setConfig: React.Dispatch<React.SetStateAction<LLMConfig>>;
  isStreaming: boolean;
  setIsStreaming: (s: boolean) => void;
  streamingText: string;
  setStreamingText: (t: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

const repairJSON = (rawText: string): string => {
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.substring(7, cleaned.length - 3).trim();
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.substring(3, cleaned.length - 3).trim();
  }

  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch (e) {}

  let braces = 0;
  let brackets = 0;
  let inString = false;
  let escaped = false;
  
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{') braces++;
      if (char === '}') braces--;
      if (char === '[') brackets++;
      if (char === ']') brackets--;
    }
  }
  
  let repaired = cleaned;
  if (inString) repaired += '"';
  while (brackets > 0) {
    repaired += ']';
    brackets--;
  }
  while (braces > 0) {
    repaired += '}';
    braces--;
  }

  try {
    JSON.parse(repaired);
    return repaired;
  } catch (e) {}

  const suffixes = [
    '\n          ]\n        }\n      ]\n    }\n  ],\n  "relations": []\n}',
    '\n      ]\n    }\n  ],\n  "relations": []\n}',
    '\n    }\n  ],\n  "relations": []\n}',
    '\n  ],\n  "relations": []\n}',
    '\n}',
    ']}',
  ];
  for (const sfx of suffixes) {
    try {
      const candidate = cleaned + sfx;
      JSON.parse(candidate);
      return candidate;
    } catch (e) {}
  }

  return cleaned;
};

export const SchemaGeneratorPanel: React.FC<SchemaGeneratorPanelProps> = ({ 
  currentSchema,
  onSchemaGenerated, 
  config, 
  setConfig,
  setIsStreaming,
  setStreamingText,
  isCollapsed,
  onToggleCollapse
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
    setIsStreaming(true);
    setStreamingText('');

    try {
      const response = await fetch('/api/schema/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          currentSchema,
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
        throw new Error(parsedErr || 'Failed to generate schema');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response stream reader is not available');
      }

      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunkText = decoder.decode(value, { stream: true });
        accumulated += chunkText;
        setStreamingText(accumulated);
      }

      console.log("LLM Raw Streamed Response:", accumulated);
      
      const repairedJson = repairJSON(accumulated);
      let schemaObj: any = null;

      try {
        schemaObj = JSON.parse(repairedJson);
      } catch (err) {
        // Fallback regex parsing if JSON structure is completely broken
        const tables: any[] = [];
        const tableMatches = repairedJson.matchAll(/"name":\s*"([^"]+)"[\s\S]*?"columns":\s*\[([\s\S]*?)\]/g);
        for (const match of tableMatches) {
          const tableName = match[1];
          const colsText = match[2];
          const columns: any[] = [];
          const colMatches = colsText.matchAll(/\{[\s\S]*?"name":\s*"([^"]+)"[\s\S]*?"type":\s*"([^"]+)"[\s\S]*?\}/g);
          for (const colMatch of colMatches) {
            columns.push({
              name: colMatch[1],
              type: colMatch[2],
              primaryKey: colMatch[0].includes('"primaryKey": true'),
              notNull: colMatch[0].includes('"notNull": true'),
              unique: colMatch[0].includes('"unique": true'),
              isIndex: colMatch[0].includes('"isIndex": true')
            });
          }
          tables.push({ name: tableName, columns });
        }
        if (tables.length > 0) {
          schemaObj = { tables, relations: [] };
        }
      }

      if (schemaObj && schemaObj.tables) {
        console.log("Parsed LLM Schema:", schemaObj);
        onSchemaGenerated(schemaObj);
        toast.success("Database schema generated successfully!");
      } else {
        throw new Error('Could not parse schema from the generated text. Try modifying your prompt.');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An unexpected error occurred. Make sure your local Ollama server is running or correct your API key.');
    } finally {
      setLoading(false);
      setIsStreaming(false);
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
    <div className="flex flex-col h-full w-full bg-transparent overflow-y-auto select-none custom-scrollbar">
      {/* Header */}
      <div 
        className={`p-4 flex items-center justify-between cursor-pointer select-none bg-card/10 hover:bg-card/20 transition-colors ${
          isCollapsed ? '' : 'border-b border-border/80'
        }`}
        onClick={isCollapsed ? onToggleCollapse : undefined}
      >
        {isCollapsed ? (
          <>
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-primary animate-pulse" />
              <span className="text-xs font-bold tracking-wide text-foreground">Generator</span>
            </div>
            <ChevronDown className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors" />
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/20 text-primary">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-xs font-bold tracking-wide text-foreground">AI Schema Generator</h2>
                <p className="text-[9px] text-muted-foreground">Describe your DB or paste any dialect</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={(e) => { e.stopPropagation(); setShowSettings(!showSettings); }}
                className={`p-1.5 rounded-lg hover:bg-secondary/60 transition-colors cursor-pointer ${
                  showSettings ? 'text-primary bg-primary/10' : 'text-muted-foreground'
                }`}
                title="LLM Settings"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }}
                className="p-1.5 rounded-lg hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title="Collapse Sidebar"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </div>

      {!isCollapsed && (
        <div className="flex flex-col flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          {/* Settings Panel */}
          {showSettings && (
            <div className="p-4 bg-secondary/30 border-b border-border/60 space-y-3.5 transition-all">
              <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <BrainCircuit className="w-3.5 h-3.5 text-primary" />
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
      )}
    </div>
  );
};
