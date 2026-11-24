import React, { useEffect, useState } from 'react';
import { EditorView } from './components/EditorView';
import { PrompterView } from './components/PrompterView';
import { DEFAULT_SETTINGS, PrompterSettings, SAMPLE_SCRIPT } from './types';

const STORAGE_SCRIPT_KEY = 'promptflow_script_v1';
const STORAGE_SETTINGS_KEY = 'promptflow_settings_v1';

export const App: React.FC = () => {
  const [mode, setMode] = useState<'editor' | 'prompter'>('editor');
  const [autoFullscreen, setAutoFullscreen] = useState(false);

  const [script, setScript] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_SCRIPT_KEY);
      return saved !== null ? saved : SAMPLE_SCRIPT;
    } catch {
      return SAMPLE_SCRIPT;
    }
  });

  const [settings, setSettings] = useState<PrompterSettings>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_SETTINGS_KEY);
      if (raw) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      }
    } catch {
      // Ignore invalid JSON
    }
    return DEFAULT_SETTINGS;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_SCRIPT_KEY, script);
    } catch {
      // Ignore storage quota errors
    }
  }, [script]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Ignore storage quota errors
    }
  }, [settings]);

  const handleUpdateSettings = (patch: Partial<PrompterSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  const handleStartPrompter = (withFullscreen: boolean) => {
    setAutoFullscreen(withFullscreen);
    setMode('prompter');
  };

  if (mode === 'prompter') {
    return (
      <PrompterView
        script={script}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        onBackToEditor={() => setMode('editor')}
        autoEnterFullscreen={autoFullscreen}
      />
    );
  }

  return (
    <EditorView
      script={script}
      onScriptChange={setScript}
      settings={settings}
      onUpdateSettings={handleUpdateSettings}
      onStartPrompter={handleStartPrompter}
    />
  );
};

export default App;
