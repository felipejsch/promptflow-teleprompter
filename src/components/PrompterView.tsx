import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  CameraOff,
  FlipHorizontal2,
  Maximize2,
  Minimize2,
  Mic,
  MicOff,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  X,
  AlertCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { AccentColor, PrompterSettings } from '../types';
import { parseScript } from '../utils/scriptTokenizer';
import { matchSpokenWords } from '../utils/wordMatcher';
import { useVoiceTracker } from '../hooks/useVoiceTracker';
import { useFullscreenAndWakeLock } from '../hooks/useFullscreenAndWakeLock';
import { useCameraPreview } from '../hooks/useCameraPreview';

interface PrompterViewProps {
  script: string;
  settings: PrompterSettings;
  onUpdateSettings: (patch: Partial<PrompterSettings>) => void;
  onBackToEditor: () => void;
  autoEnterFullscreen: boolean;
}

export const PrompterView: React.FC<PrompterViewProps> = ({
  script,
  settings,
  onUpdateSettings,
  onBackToEditor,
  autoEnterFullscreen,
}) => {
  const parsed = useMemo(() => parseScript(script), [script]);
  const totalWords = parsed.words.length;

  // spokenIndex = index of the word most recently confirmed by voice (-1 before starting)
  const [spokenIndex, setSpokenIndex] = useState<number>(-1);
  const spokenIndexRef = useRef<number>(-1);

  const [hudVisible, setHudVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [manualRunning, setManualRunning] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollAnimRef = useRef<number | null>(null);
  const wordRefs = useRef<Map<number, HTMLSpanElement>>(new Map());

  // Apply highlightLead in voice mode to compensate for ~250ms speech-to-text latency
  const effectiveLead = settings.scrollMode === 'voice' ? settings.highlightLead : 0;
  const activeIndex =
    totalWords === 0
      ? -1
      : spokenIndex < 0
        ? effectiveLead > 0
          ? 0
          : -1
        : Math.min(totalWords - 1, spokenIndex + effectiveLead);

  const { isFullscreen, enterFullscreen, exitFullscreen, toggleFullscreen } =
    useFullscreenAndWakeLock(true);

  const { videoRef, cameraError } = useCameraPreview(settings.cameraPreview);

  useEffect(() => {
    if (autoEnterFullscreen) {
      enterFullscreen();
    }
  }, [autoEnterFullscreen, enterFullscreen]);

  const setCursor = useCallback((nextSpokenIndex: number) => {
    const clamped = Math.max(-1, Math.min(nextSpokenIndex, totalWords - 1));
    spokenIndexRef.current = clamped;
    setSpokenIndex(clamped);
  }, [totalWords]);

  const handleSpokenWords = useCallback(
    (spokenWords: string[]) => {
      const next = matchSpokenWords(parsed.words, spokenIndexRef.current, spokenWords);
      if (next !== spokenIndexRef.current) {
        spokenIndexRef.current = next;
        setSpokenIndex(next);
      }
    },
    [parsed.words]
  );

  const {
    isSupported,
    isListening,
    error: voiceError,
    liveTranscript,
    startListening,
    stopListening,
  } = useVoiceTracker({
    lang: settings.language,
    onSpokenWords: handleSpokenWords,
  });

  // Manual WPM mode fallback timer
  useEffect(() => {
    if (settings.scrollMode !== 'manual' || !manualRunning) return;
    if (spokenIndexRef.current >= totalWords - 1) {
      setManualRunning(false);
      return;
    }

    const msPerWord = Math.round(60000 / Math.max(60, settings.manualWpm));
    const timer = window.setInterval(() => {
      if (spokenIndexRef.current >= totalWords - 1) {
        setManualRunning(false);
        return;
      }
      setCursor(spokenIndexRef.current + 1);
    }, msPerWord);

    return () => window.clearInterval(timer);
  }, [settings.scrollMode, settings.manualWpm, manualRunning, totalWords, setCursor]);

  // Fast, snappy ease-out rAF auto-scroll (~140ms) keeping active word in camera eye-line zone
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const targetWordIdx = activeIndex < 0 ? 0 : activeIndex;
    const wordEl = wordRefs.current.get(targetWordIdx);
    if (!wordEl) return;

    const containerRect = container.getBoundingClientRect();
    const wordRect = wordEl.getBoundingClientRect();

    const desiredTopInViewport = containerRect.height * (settings.focusLineTop / 100);
    const currentWordTopInViewport = wordRect.top - containerRect.top;
    const delta = currentWordTopInViewport - desiredTopInViewport;

    if (Math.abs(delta) <= 6) return;

    const startScroll = container.scrollTop;
    const targetScroll = Math.max(0, startScroll + delta);
    const distance = targetScroll - startScroll;
    if (Math.abs(distance) <= 2) return;

    if (scrollAnimRef.current !== null) {
      cancelAnimationFrame(scrollAnimRef.current);
    }

    const duration = 140;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      // Cubic ease-out for instant responsiveness with smooth landing
      const eased = 1 - Math.pow(1 - t, 3);
      container.scrollTop = startScroll + distance * eased;

      if (t < 1) {
        scrollAnimRef.current = requestAnimationFrame(step);
      } else {
        scrollAnimRef.current = null;
      }
    };

    scrollAnimRef.current = requestAnimationFrame(step);

    return () => {
      if (scrollAnimRef.current !== null) {
        cancelAnimationFrame(scrollAnimRef.current);
        scrollAnimRef.current = null;
      }
    };
  }, [activeIndex, settings.focusLineTop, settings.fontSize, settings.lineHeight]);

  // Stop listening when switching to manual mode or leaving
  const handleTogglePlay = () => {
    if (settings.scrollMode === 'voice') {
      if (isListening) {
        stopListening();
      } else {
        setSettingsOpen(false);
        startListening();
      }
    } else {
      if (manualRunning) {
        setManualRunning(false);
      } else {
        setSettingsOpen(false);
        if (spokenIndexRef.current >= totalWords - 1) {
          setCursor(-1);
        }
        setManualRunning(true);
      }
    }
  };

  const handleReset = () => {
    setCursor(-1);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleExit = async () => {
    stopListening();
    setManualRunning(false);
    if (isFullscreen) {
      await exitFullscreen();
    }
    onBackToEditor();
  };

  const handleWordClick = (e: React.MouseEvent, wordIndex: number) => {
    e.stopPropagation();
    // Place spokenIndex behind the tapped word by effectiveLead so the tapped word lights up directly
    setCursor(wordIndex - effectiveLead);
  };

  const handleStageTap = () => {
    if (settingsOpen) {
      setSettingsOpen(false);
      return;
    }
    setHudVisible((v) => !v);
  };

  const isRunning = settings.scrollMode === 'voice' ? isListening : manualRunning;
  const progressPercent =
    totalWords > 0 && activeIndex >= 0
      ? Math.min(100, Math.round(((activeIndex + 1) / totalWords) * 100))
      : 0;

  return (
    <div
      className={`prompter-shell accent-${settings.accent}`}
      onClick={handleStageTap}
    >
      {/* Optional Front-Camera Background Preview */}
      {settings.cameraPreview && (
        <div className="camera-layer" aria-hidden="true">
          <video
            ref={videoRef}
            className="camera-video"
            playsInline
            muted
            autoPlay
            style={{ opacity: settings.cameraOpacity }}
          />
          <div className="camera-scrim" />
        </div>
      )}

      {/* Subtle Eye-Line Camera Reading Zone Guide */}
      <div
        className="focus-guide"
        style={{ top: `${settings.focusLineTop}%` }}
        aria-hidden="true"
      >
        <span className="focus-chevron left" />
        <span className="focus-line" />
        <span className="focus-chevron right" />
      </div>

      {/* Top Gradient Fade for Notch/Camera Clarity */}
      <div className="top-vignette" aria-hidden="true" />
      <div className="bottom-vignette" aria-hidden="true" />

      {/* Top HUD */}
      <header
        className={`prompter-top-hud ${hudVisible ? 'visible' : 'hidden'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="hud-icon-btn"
          onClick={handleExit}
          aria-label="Voltar para o editor"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="status-center">
          <div className={`status-pill ${isRunning ? 'live' : ''}`}>
            <span className="status-dot" />
            <span className="status-text">
              {settings.scrollMode === 'voice'
                ? isListening
                  ? settings.showLiveTranscript && liveTranscript
                    ? `“${liveTranscript}”`
                    : 'Ouvindo sua voz...'
                  : 'Pronto • Toque no microfone'
                : manualRunning
                  ? `Rolagem • ${settings.manualWpm} PPM`
                  : `Manual • ${settings.manualWpm} PPM`}
            </span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        <button
          type="button"
          className="hud-icon-btn"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
        >
          {isFullscreen ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
        </button>
      </header>

      {/* Error Toast (Mic or Camera) */}
      {(voiceError || cameraError || (!isSupported && settings.scrollMode === 'voice')) && (
        <div className="error-toast" onClick={(e) => e.stopPropagation()}>
          <AlertCircle size={16} />
          <span>
            {voiceError ||
              cameraError ||
              'Seu navegador não suporta reconhecimento de voz. Use Chrome/Edge/Safari ou ative o modo Manual nos ajustes.'}
          </span>
        </div>
      )}

      {/* Main Scrollable Script Area */}
      <div
        ref={scrollContainerRef}
        className={`prompter-stage ${settings.mirror ? 'mirrored' : ''}`}
      >
        <div
          className="prompter-content"
          style={{
            paddingTop: `${settings.focusLineTop}dvh`,
            paddingBottom: '75dvh',
            paddingLeft: `${settings.horizontalMargin}%`,
            paddingRight: `${settings.horizontalMargin}%`,
            fontSize: `${settings.fontSize}px`,
            lineHeight: settings.lineHeight,
          }}
        >
          {parsed.paragraphs.map((para) => (
            <p key={para.index} className="prompter-paragraph">
              {para.words.map((word) => {
                let stateClass = 'word-upcoming';
                if (word.index < activeIndex) {
                  stateClass = 'word-spoken';
                } else if (word.index === activeIndex) {
                  stateClass = 'word-active';
                } else if (word.index === activeIndex + 1) {
                  stateClass = 'word-next';
                }

                return (
                  <React.Fragment key={word.index}>
                    <span
                      ref={(el) => {
                        if (el) wordRefs.current.set(word.index, el);
                        else wordRefs.current.delete(word.index);
                      }}
                      data-word-index={word.index}
                      className={`script-word ${stateClass}`}
                      onClick={(e) => handleWordClick(e, word.index)}
                    >
                      {word.raw}
                    </span>{' '}
                  </React.Fragment>
                );
              })}
            </p>
          ))}
        </div>
      </div>

      {/* Bottom Floating Controls Dock */}
      <footer
        className={`prompter-bottom-hud ${hudVisible ? 'visible' : 'hidden'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dock-bar">
          <button
            type="button"
            className="dock-btn"
            onClick={handleReset}
            aria-label="Voltar ao início"
            title="Voltar ao início"
          >
            <RotateCcw size={20} />
          </button>

          <button
            type="button"
            className={`dock-btn ${settings.cameraPreview ? 'active' : ''}`}
            onClick={() => onUpdateSettings({ cameraPreview: !settings.cameraPreview })}
            aria-label="Alternar câmera frontal"
            title="Câmera frontal ao fundo"
          >
            {settings.cameraPreview ? <Camera size={20} /> : <CameraOff size={20} />}
          </button>

          <button
            type="button"
            className={`dock-main-btn ${isRunning ? 'running' : ''}`}
            onClick={handleTogglePlay}
            aria-label={isRunning ? 'Pausar acompanhamento' : 'Iniciar acompanhamento'}
          >
            {settings.scrollMode === 'voice' ? (
              isListening ? (
                <MicOff size={26} strokeWidth={2.4} />
              ) : (
                <Mic size={26} strokeWidth={2.4} />
              )
            ) : manualRunning ? (
              <Pause size={26} strokeWidth={2.4} />
            ) : (
              <Play size={26} strokeWidth={2.4} />
            )}
          </button>

          <button
            type="button"
            className={`dock-btn ${settings.mirror ? 'active' : ''}`}
            onClick={() => onUpdateSettings({ mirror: !settings.mirror })}
            aria-label="Espelhar texto"
            title="Espelhar texto"
          >
            <FlipHorizontal2 size={20} />
          </button>

          <button
            type="button"
            className={`dock-btn ${settingsOpen ? 'active' : ''}`}
            onClick={() => setSettingsOpen((o) => !o)}
            aria-label="Ajustes"
            title="Ajustes do teleprompter"
          >
            <SlidersHorizontal size={20} />
          </button>
        </div>

        <p className="dock-hint">
          Toque em qualquer palavra para pular • Toque na tela para ocultar os botões
        </p>
      </footer>

      {/* Floating Eye Button when HUD is hidden */}
      {!hudVisible && (
        <button
          type="button"
          className="hud-reveal-fab"
          onClick={(e) => {
            e.stopPropagation();
            setHudVisible(true);
          }}
          aria-label="Mostrar controles"
        >
          <Eye size={18} />
        </button>
      )}

      {/* Slide-Up Settings Bottom Sheet */}
      {settingsOpen && (
        <div
          className="settings-backdrop"
          onClick={(e) => {
            e.stopPropagation();
            setSettingsOpen(false);
          }}
        >
          <div className="settings-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-header">
              <h2>Ajustes do Teleprompter</h2>
              <button
                type="button"
                className="sheet-close"
                onClick={() => setSettingsOpen(false)}
                aria-label="Fechar ajustes"
              >
                <X size={20} />
              </button>
            </div>

            <div className="sheet-body">
              {/* Mode Switch */}
              <div className="setting-group">
                <label className="setting-label">Modo de acompanhamento</label>
                <div className="segmented-control">
                  <button
                    type="button"
                    className={settings.scrollMode === 'voice' ? 'active' : ''}
                    onClick={() => {
                      setManualRunning(false);
                      onUpdateSettings({ scrollMode: 'voice' });
                    }}
                  >
                    <Mic size={15} />
                    Por Voz (Auto)
                  </button>
                  <button
                    type="button"
                    className={settings.scrollMode === 'manual' ? 'active' : ''}
                    onClick={() => {
                      stopListening();
                      onUpdateSettings({ scrollMode: 'manual' });
                    }}
                  >
                    <Play size={15} />
                    Velocidade (PPM)
                  </button>
                </div>
              </div>

              {settings.scrollMode === 'voice' && (
                <div className="setting-group">
                  <div className="setting-label-row">
                    <label>Compensação de lag da voz</label>
                    <span className="setting-value">
                      {settings.highlightLead === 0
                        ? 'Exata'
                        : `+${settings.highlightLead} palavra${settings.highlightLead > 1 ? 's' : ''}`}
                    </span>
                  </div>
                  <div className="segmented-control three-col">
                    {[
                      { val: 0, label: '0 (Na fala)' },
                      { val: 1, label: '+1 (Sem lag)' },
                      { val: 2, label: '+2 (Rápido)' },
                    ].map((opt) => (
                      <button
                        key={opt.val}
                        type="button"
                        className={settings.highlightLead === opt.val ? 'active' : ''}
                        onClick={() => onUpdateSettings({ highlightLead: opt.val })}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {settings.scrollMode === 'manual' && (
                <div className="setting-group">
                  <div className="setting-label-row">
                    <label>Velocidade de leitura</label>
                    <span className="setting-value">{settings.manualWpm} PPM</span>
                  </div>
                  <input
                    type="range"
                    min={80}
                    max={220}
                    step={5}
                    value={settings.manualWpm}
                    onChange={(e) => onUpdateSettings({ manualWpm: Number(e.target.value) })}
                  />
                </div>
              )}

              {/* Font Size */}
              <div className="setting-group">
                <div className="setting-label-row">
                  <label>Tamanho da letra</label>
                  <span className="setting-value">{settings.fontSize}px</span>
                </div>
                <input
                  type="range"
                  min={22}
                  max={60}
                  step={2}
                  value={settings.fontSize}
                  onChange={(e) => onUpdateSettings({ fontSize: Number(e.target.value) })}
                />
              </div>

              {/* Focus Line Top (Camera Eye-Line) */}
              <div className="setting-group">
                <div className="setting-label-row">
                  <label>Altura da linha (perto da câmera)</label>
                  <span className="setting-value">{settings.focusLineTop}%</span>
                </div>
                <input
                  type="range"
                  min={14}
                  max={45}
                  step={1}
                  value={settings.focusLineTop}
                  onChange={(e) => onUpdateSettings({ focusLineTop: Number(e.target.value) })}
                />
              </div>

              {/* Horizontal Margin */}
              <div className="setting-group">
                <div className="setting-label-row">
                  <label>Margem lateral (reduz movimento dos olhos)</label>
                  <span className="setting-value">{settings.horizontalMargin}%</span>
                </div>
                <input
                  type="range"
                  min={4}
                  max={24}
                  step={2}
                  value={settings.horizontalMargin}
                  onChange={(e) => onUpdateSettings({ horizontalMargin: Number(e.target.value) })}
                />
              </div>

              {/* Camera Opacity when enabled */}
              {settings.cameraPreview && (
                <div className="setting-group">
                  <div className="setting-label-row">
                    <label>Brilho da câmera ao fundo</label>
                    <span className="setting-value">
                      {Math.round(settings.cameraOpacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.15}
                    max={0.7}
                    step={0.05}
                    value={settings.cameraOpacity}
                    onChange={(e) => onUpdateSettings({ cameraOpacity: Number(e.target.value) })}
                  />
                </div>
              )}

              {/* Accent Color */}
              <div className="setting-group">
                <label className="setting-label">Cor do destaque da palavra</label>
                <div className="accent-swatches">
                  {(
                    [
                      { id: 'amber', label: 'Âmbar', color: '#F59E0B' },
                      { id: 'cyan', label: 'Ciano', color: '#06B6D4' },
                      { id: 'emerald', label: 'Esmeralda', color: '#10B981' },
                    ] as { id: AccentColor; label: string; color: string }[]
                  ).map((swatch) => (
                    <button
                      key={swatch.id}
                      type="button"
                      className={`swatch-btn ${settings.accent === swatch.id ? 'active' : ''}`}
                      onClick={() => onUpdateSettings({ accent: swatch.id })}
                    >
                      <span className="swatch-dot" style={{ background: swatch.color }} />
                      <span>{swatch.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggle Live Transcript */}
              <div className="setting-toggle-row">
                <div>
                  <div className="setting-label">Mostrar o que o mic ouve</div>
                  <div className="setting-sub">Ajuda a conferir o reconhecimento no topo</div>
                </div>
                <button
                  type="button"
                  className={`toggle-pill ${settings.showLiveTranscript ? 'on' : ''}`}
                  onClick={() =>
                    onUpdateSettings({ showLiveTranscript: !settings.showLiveTranscript })
                  }
                >
                  {settings.showLiveTranscript ? <Eye size={15} /> : <EyeOff size={15} />}
                  <span>{settings.showLiveTranscript ? 'Ativo' : 'Oculto'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
