import { useCallback, useEffect, useRef, useState } from 'react';
import { tokenizeTranscript } from '../utils/scriptTokenizer';

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      length: number;
      [altIndex: number]: {
        transcript: string;
        confidence: number;
      };
    };
  };
}

interface SpeechRecognitionErrorEventLike {
  error: string;
  message?: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export interface UseVoiceTrackerOptions {
  lang: string;
  onSpokenWords: (words: string[]) => void;
}

export function useVoiceTracker({ lang, onSpokenWords }: UseVoiceTrackerOptions) {
  const [isSupported] = useState<boolean>(() => getSpeechRecognitionConstructor() !== null);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState('');

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldBeListeningRef = useRef(false);
  const onSpokenWordsRef = useRef(onSpokenWords);
  const restartTimeoutRef = useRef<number | null>(null);

  // Incremental tracking: avoids re-tokenizing old finalized results on every interim frame
  const lastFinalResultIndexRef = useRef(-1);
  const lastContextWordRef = useRef<string | null>(null);
  const lastInterimSignatureRef = useRef('');

  useEffect(() => {
    onSpokenWordsRef.current = onSpokenWords;
  }, [onSpokenWords]);

  const clearRestartTimer = () => {
    if (restartTimeoutRef.current !== null) {
      window.clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
  };

  const stopListening = useCallback(() => {
    shouldBeListeningRef.current = false;
    clearRestartTimer();
    setIsListening(false);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {
        // Ignore already stopped errors
      }
      recognitionRef.current = null;
    }
  }, []);

  const startRecognitionInstance = useCallback(() => {
    const SpeechRec = getSpeechRecognitionConstructor();
    if (!SpeechRec) {
      setError('Reconhecimento de voz não suportado neste navegador. Use Chrome, Edge ou Safari.');
      return;
    }

    clearRestartTimer();

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch {
        // Ignore
      }
    }

    const recognition = new SpeechRec();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    lastFinalResultIndexRef.current = -1;
    lastContextWordRef.current = null;
    lastInterimSignatureRef.current = '';

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      const startIdx = Math.max(0, event.resultIndex);
      const newlyFinalizedTokens: string[] = [];
      let currentInterimText = '';
      let latestDisplayChunk = '';

      for (let i = startIdx; i < event.results.length; i++) {
        const res = event.results[i];
        const text = res[0]?.transcript ?? '';
        if (!text) continue;

        latestDisplayChunk += ' ' + text;

        if (res.isFinal) {
          if (i > lastFinalResultIndexRef.current) {
            lastFinalResultIndexRef.current = i;
            newlyFinalizedTokens.push(...tokenizeTranscript(text));
          }
        } else {
          currentInterimText += ' ' + text;
        }
      }

      const displayWords = latestDisplayChunk.trim().split(/\s+/).filter(Boolean);
      if (displayWords.length > 0) {
        setLiveTranscript(displayWords.slice(-7).join(' '));
      }

      const interimTokens = tokenizeTranscript(currentInterimText);

      const candidateStream: string[] = [];
      if (lastContextWordRef.current && newlyFinalizedTokens.length === 0) {
        candidateStream.push(lastContextWordRef.current);
      }
      candidateStream.push(...newlyFinalizedTokens, ...interimTokens);

      if (newlyFinalizedTokens.length > 0) {
        lastContextWordRef.current = newlyFinalizedTokens[newlyFinalizedTokens.length - 1];
      }

      if (candidateStream.length === 0) return;

      const tail = candidateStream.slice(-8);
      const sig = tail.join(' ');
      if (sig !== lastInterimSignatureRef.current) {
        lastInterimSignatureRef.current = sig;
        onSpokenWordsRef.current(tail);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setError('Permissão do microfone negada. Libere o microfone no navegador para acompanhar sua voz.');
        shouldBeListeningRef.current = false;
        setIsListening(false);
        return;
      }
      if (event.error === 'audio-capture') {
        setError('Nenhum microfone encontrado neste dispositivo.');
        shouldBeListeningRef.current = false;
        setIsListening(false);
        return;
      }
      if (event.error === 'network') {
        setError('Sem conexão com o serviço de voz do navegador.');
      }
    };

    recognition.onend = () => {
      if (shouldBeListeningRef.current) {
        restartTimeoutRef.current = window.setTimeout(() => {
          if (shouldBeListeningRef.current) {
            startRecognitionInstance();
          }
        }, 60);
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      restartTimeoutRef.current = window.setTimeout(() => {
        if (shouldBeListeningRef.current) {
          startRecognitionInstance();
        }
      }, 150);
    }
  }, [lang]);

  const startListening = useCallback(() => {
    setError(null);
    shouldBeListeningRef.current = true;
    startRecognitionInstance();
  }, [startRecognitionInstance]);

  useEffect(() => {
    if (shouldBeListeningRef.current) {
      startRecognitionInstance();
    }
  }, [lang, startRecognitionInstance]);

  useEffect(() => {
    return () => {
      shouldBeListeningRef.current = false;
      clearRestartTimer();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onend = null;
          recognitionRef.current.abort();
        } catch {
          // Ignore
        }
      }
    };
  }, []);

  return {
    isSupported,
    isListening,
    error,
    liveTranscript,
    startListening,
    stopListening,
  };
}
