export type AccentColor = 'amber' | 'cyan' | 'emerald';

export type ScrollMode = 'voice' | 'manual';

export interface PrompterSettings {
  fontSize: number; // px (22 - 64)
  lineHeight: number; // 1.25 - 1.8
  horizontalMargin: number; // % (4 - 24)
  focusLineTop: number; // % from top (14 - 45) — near front camera by default (~20%)
  language: string; // 'pt-BR' | 'en-US' | 'es-ES'
  accent: AccentColor;
  mirror: boolean;
  cameraPreview: boolean;
  cameraOpacity: number; // 0.15 - 0.7
  showLiveTranscript: boolean;
  scrollMode: ScrollMode;
  manualWpm: number; // 80 - 220
  highlightLead: number; // 0 = exact spoken word, 1 = next word (compensates ASR lag), 2 = +2 words ahead
}

export const DEFAULT_SETTINGS: PrompterSettings = {
  fontSize: 34,
  lineHeight: 1.45,
  horizontalMargin: 8,
  focusLineTop: 20,
  language: 'pt-BR',
  accent: 'amber',
  mirror: false,
  cameraPreview: false,
  cameraOpacity: 0.35,
  showLiveTranscript: true,
  scrollMode: 'voice',
  manualWpm: 135,
  highlightLead: 1,
};

export const SAMPLE_SCRIPT = `Fala pessoal, tudo bem? Hoje eu vou mostrar como gravar vídeos muito mais naturais usando um teleprompter inteligente direto no celular.

O segredo para parecer que você está olhando nos olhos de quem assiste é deixar o texto bem perto da câmera frontal, aqui no topo da tela.

Enquanto eu falo, o teleprompter acompanha a minha voz em tempo real e destaca cada palavra que eu pronuncio. Se eu fizer uma pausa para respirar, ele espera por mim. Se eu acelerar o ritmo, ele acompanha automaticamente.

Assim eu nunca perco o fio da meada, evito cortes desnecessários na edição e consigo gravar muito mais rápido. Vamos testar na prática!`;
