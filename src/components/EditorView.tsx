import React from 'react';
import {
  Maximize2,
  Mic,
  Sparkles,
  Trash2,
  Clock,
  FileText,
  Globe,
} from 'lucide-react';
import { PrompterSettings, SAMPLE_SCRIPT } from '../types';
import { estimateReadingTime, parseScript } from '../utils/scriptTokenizer';

interface EditorViewProps {
  script: string;
  onScriptChange: (value: string) => void;
  settings: PrompterSettings;
  onUpdateSettings: (patch: Partial<PrompterSettings>) => void;
  onStartPrompter: (withFullscreen: boolean) => void;
}

const LANGUAGES = [
  { code: 'pt-BR', label: 'PT-BR' },
  { code: 'en-US', label: 'EN-US' },
  { code: 'es-ES', label: 'ES-ES' },
];

export const EditorView: React.FC<EditorViewProps> = ({
  script,
  onScriptChange,
  settings,
  onUpdateSettings,
  onStartPrompter,
}) => {
  const parsed = parseScript(script);
  const wordCount = parsed.words.length;
  const estTime = estimateReadingTime(wordCount);

  return (
    <div className="editor-shell">
      <header className="editor-header">
        <div className="brand">
          <div className="brand-icon">
            <Mic size={18} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="brand-title">PromptFlow</h1>
            <p className="brand-subtitle">Teleprompter por voz • Mobile-first</p>
          </div>
        </div>

        <div className="lang-pill-group" role="group" aria-label="Idioma da voz">
          <Globe size={14} className="lang-icon" />
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              className={`lang-pill ${settings.language === l.code ? 'active' : ''}`}
              onClick={() => onUpdateSettings({ language: l.code })}
            >
              {l.label}
            </button>
          ))}
        </div>
      </header>

      <main className="editor-main">
        <div className="editor-meta-bar">
          <div className="meta-chips">
            <span className="meta-chip">
              <FileText size={14} />
              {wordCount} {wordCount === 1 ? 'palavra' : 'palavras'}
            </span>
            <span className="meta-chip">
              <Clock size={14} />
              ~{estTime}
            </span>
          </div>

          <div className="meta-actions">
            <button
              type="button"
              className="ghost-btn"
              onClick={() => onScriptChange(SAMPLE_SCRIPT)}
              title="Carregar roteiro de exemplo"
            >
              <Sparkles size={14} />
              <span>Exemplo</span>
            </button>
            <button
              type="button"
              className="ghost-btn danger"
              onClick={() => onScriptChange('')}
              disabled={!script.trim()}
              title="Limpar texto"
            >
              <Trash2 size={14} />
              <span>Limpar</span>
            </button>
          </div>
        </div>

        <div className="textarea-card">
          <textarea
            className="script-textarea"
            value={script}
            onChange={(e) => onScriptChange(e.target.value)}
            placeholder="Cole ou digite seu roteiro aqui...&#10;&#10;Dica: separe os parágrafos com Enter para respirar com calma durante a gravação."
            spellCheck
            autoCapitalize="sentences"
          />
        </div>

        <div className="tip-banner">
          <span className="tip-dot" />
          <p>
            O texto fica posicionado no <strong>topo da tela</strong> perto da câmera frontal e
            destaca cada palavra conforme você fala.
          </p>
        </div>
      </main>

      <footer className="editor-footer">
        <button
          type="button"
          className="primary-cta"
          disabled={wordCount === 0}
          onClick={() => onStartPrompter(true)}
        >
          <Maximize2 size={20} strokeWidth={2.4} />
          <span>Abrir Teleprompter em Tela Cheia</span>
        </button>
      </footer>
    </div>
  );
};
