/** Speech-to-text for the capture note. The page never uploads audio. */

export const DICTATION_UNAVAILABLE = "Dictation isn't available in this browser. You can still type the note.";
export const DICTATION_BLOCKED = 'The microphone was blocked. You can still type the note.';
export const DICTATION_NO_MICROPHONE = "Dictation couldn't use the microphone. You can still type the note.";
export const DICTATION_FAILED = "Dictation didn't start. You can still type the note.";

export interface SpeechResult {
  isFinal: boolean;
  transcript: string;
}

export interface SpeechSession {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((results: SpeechResult[]) => void) | null;
  onerror: ((error: string) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export interface NativeSpeechAlternative {
  transcript: string;
}

export interface NativeSpeechResult {
  isFinal: boolean;
  readonly [index: number]: NativeSpeechAlternative | undefined;
}

export interface NativeSpeechEvent {
  results: ArrayLike<NativeSpeechResult | undefined>;
}

/** The bit of SpeechRecognition the page actually uses, including the webkit-prefixed shape. */
export interface NativeRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: NativeSpeechEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export interface Meter {
  level(): number;
  stop(): void;
}

export interface DictationEnv {
  recognition(): SpeechSession | null;
  /** Local microphone level. Rejects when the browser refuses or can't open one. */
  openMeter(): Promise<Meter>;
  lang(): string;
}

export interface DictationListener {
  /** Final text so far this utterance, plus the live interim, as one suffix. */
  spoken(text: string): void;
  /** Finished text for this utterance. Empty drops an interim that never became final. */
  committed(text: string): void;
  listening(on: boolean): void;
  meter(on: boolean): void;
  message(text: string): void;
}

export interface DictationControl {
  press(): void;
  stop(): void;
  noteEdited(): void;
  dropMeter(): void;
}

export function joinNote(base: string, spoken: string, max = Number.POSITIVE_INFINITY): string {
  const extra = spoken.trim();
  if (!extra) return base.slice(0, max);
  const joined = base.length === 0 ? extra : /\s$/.test(base) ? `${base}${extra}` : `${base} ${extra}`;
  return joined.slice(0, max);
}

export function collectTranscript(results: readonly SpeechResult[]): { finalText: string; interim: string } {
  let finalText = '';
  let interim = '';
  for (const result of results) {
    if (result.isFinal) finalText += result.transcript;
    else interim += result.transcript;
  }
  return { finalText, interim };
}

/** Copies the session flags onto a browser recognizer and translates its events. */
export function adaptRecognition(native: NativeRecognition): SpeechSession {
  const session: SpeechSession = {
    continuous: false,
    interimResults: false,
    lang: '',
    onresult: null,
    onerror: null,
    onend: null,
    start() {
      native.continuous = session.continuous;
      native.interimResults = session.interimResults;
      native.lang = session.lang;
      native.start();
    },
    stop() {
      native.stop();
    },
    abort() {
      native.abort();
    },
  };
  native.onresult = (event) => {
    const results: SpeechResult[] = [];
    for (let index = 0; index < event.results.length; index++) {
      const result = event.results[index];
      if (!result) continue;
      results.push({ isFinal: result.isFinal, transcript: result[0]?.transcript ?? '' });
    }
    session.onresult?.(results);
  };
  native.onerror = (event) => {
    session.onerror?.(event.error);
  };
  native.onend = () => {
    session.onend?.();
  };
  return session;
}

interface SpeechWindow {
  SpeechRecognition?: new () => NativeRecognition;
  webkitSpeechRecognition?: new () => NativeRecognition;
}

/** Chrome's SpeechRecognition, or Safari's webkitSpeechRecognition. Nothing, when the browser has neither. */
export function browserRecognition(): SpeechSession | null {
  const win = window as unknown as SpeechWindow;
  const Ctor = win.SpeechRecognition ?? win.webkitSpeechRecognition;
  if (typeof Ctor !== 'function') return null;
  return adaptRecognition(new Ctor());
}

function safeAbort(session: SpeechSession | null) {
  if (!session) return;
  try {
    session.abort();
  } catch {
    // The recognizer had already ended.
  }
}

/**
 * Owns one dictation. Speech starts only from `press`. A level meter is optional: a refusal, or a
 * recognizer error caused by holding the microphone, turns the meter off and leaves the note going.
 */
export function createDictation(env: DictationEnv, listener: DictationListener): DictationControl {
  let generation = 0;
  let meterAttempt = 0;
  let listening = false;
  let meterOn = false;
  let wantsMeter = false;
  let gaveUpMeter = false;
  let heardSession = false;
  let lastFinal = '';
  let lastError = '';
  let current: SpeechSession | null = null;
  let meter: Meter | null = null;
  let lastRestartAt = 0;
  let quickRestarts = 0;
  let announced = '';

  function say(text: string) {
    if (text === announced) return;
    announced = text;
    listener.message(text);
  }

  function releaseMeter() {
    const open = meter;
    meter = null;
    open?.stop();
  }

  function setMeterOff() {
    const wasOn = meterOn;
    meterOn = false;
    releaseMeter();
    if (wasOn) listener.meter(false);
  }

  function endListening() {
    const wasListening = listening || current !== null;
    listening = false;
    generation += 1;
    meterAttempt += 1;
    wantsMeter = false;
    const previous = current;
    current = null;
    setMeterOff();
    safeAbort(previous);
    if (wasListening) listener.listening(false);
  }

  function fail(text: string) {
    endListening();
    say(text);
  }

  function commitFinal() {
    const spoken = lastFinal;
    lastFinal = '';
    listener.committed(spoken);
  }

  function skipMeter() {
    gaveUpMeter = true;
    wantsMeter = false;
    meterAttempt += 1;
    setMeterOff();
  }

  function boot(session: SpeechSession): boolean {
    generation += 1;
    const gen = generation;
    heardSession = false;
    lastFinal = '';
    lastError = '';
    if (current) {
      const previous = current;
      current = null;
      safeAbort(previous);
    }
    session.continuous = true;
    session.interimResults = true;
    session.lang = env.lang();
    session.onresult = (results) => {
      if (gen !== generation) return;
      const { finalText, interim } = collectTranscript(results);
      lastFinal = finalText;
      const spoken = `${finalText}${interim}`;
      if (spoken.trim()) heardSession = true;
      listener.spoken(spoken);
    };
    session.onerror = (error) => {
      if (gen !== generation) return;
      lastError = error;
      if (error === 'not-allowed' || error === 'service-not-allowed') {
        fail(DICTATION_BLOCKED);
        return;
      }
      if (error === 'network') {
        fail(DICTATION_FAILED);
        return;
      }
      if (error === 'audio-capture') {
        if (wantsMeter && !gaveUpMeter) {
          skipMeter();
          commitFinal();
          restart();
          return;
        }
        fail(DICTATION_NO_MICROPHONE);
      }
    };
    session.onend = () => {
      if (gen !== generation || !listening) return;
      const error = lastError;
      lastError = '';
      if (error === 'aborted' && wantsMeter && !gaveUpMeter && !heardSession) {
        skipMeter();
        commitFinal();
        restart();
        return;
      }
      if (error === 'aborted') {
        commitFinal();
        endListening();
        return;
      }
      if (error && error !== 'no-speech') {
        fail(DICTATION_FAILED);
        return;
      }
      commitFinal();
      restart();
    };
    current = session;
    try {
      session.start();
      return true;
    } catch {
      fail(DICTATION_FAILED);
      return false;
    }
  }

  function restart() {
    const now = Date.now();
    if (now - lastRestartAt < 250) quickRestarts += 1;
    else quickRestarts = 0;
    lastRestartAt = now;
    if (quickRestarts > 5) {
      fail(DICTATION_FAILED);
      return;
    }
    const session = env.recognition();
    if (!session) {
      fail(DICTATION_UNAVAILABLE);
      return;
    }
    boot(session);
  }

  async function attachMeter() {
    if (!wantsMeter || gaveUpMeter || !listening) return;
    meterAttempt += 1;
    const attempt = meterAttempt;
    try {
      const opened = await env.openMeter();
      if (attempt !== meterAttempt || !listening || gaveUpMeter) {
        opened.stop();
        return;
      }
      meter = opened;
      meterOn = true;
      listener.meter(true);
    } catch {
      // Refused, missing, or it can't share the microphone. Dictation still works without a meter.
    }
  }

  return {
    press() {
      if (listening) {
        endListening();
        return;
      }
      const session = env.recognition();
      if (!session) {
        say(DICTATION_UNAVAILABLE);
        return;
      }
      wantsMeter = true;
      gaveUpMeter = false;
      quickRestarts = 0;
      listening = true;
      listener.listening(true);
      say('');
      if (!boot(session)) return;
      void attachMeter();
    },
    stop() {
      if (!listening && !current) return;
      endListening();
    },
    noteEdited() {
      if (!listening) return;
      const session = env.recognition();
      if (!session) {
        fail(DICTATION_UNAVAILABLE);
        return;
      }
      boot(session);
    },
    dropMeter() {
      skipMeter();
    },
  };
}
