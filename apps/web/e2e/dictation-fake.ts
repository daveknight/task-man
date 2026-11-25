import type { Page } from '@playwright/test';

export type DictationMode = 'ok' | 'no-api' | 'denied-speech' | 'denied-meter' | 'fight';

export interface DictationProbe {
  starts: number;
  aborts: number;
  meterAsks: number;
  trackStops: number;
  contexts: number;
  closes: number;
  sampleReads: number;
  recorders: number;
  constraints: { audio?: boolean } | null;
}

/** Installs a fake Web Speech recognizer and a local meter before the page loads. */
export async function installDictation(page: Page, mode: DictationMode) {
  await page.addInitScript((mode: DictationMode) => {
    const probe = {
      mode,
      starts: 0,
      aborts: 0,
      meterAsks: 0,
      trackStops: 0,
      contexts: 0,
      closes: 0,
      sampleReads: 0,
      recorders: 0,
      constraints: null as { audio?: boolean } | null,
      level: 0.8,
      current: null as {
        onresult: ((event: { results: unknown }) => void) | null;
        onerror: ((event: { error: string }) => void) | null;
        onend: (() => void) | null;
      } | null,
    };
    (window as unknown as { __dictation: typeof probe }).__dictation = probe;

    if (mode === 'no-api') {
      Object.defineProperty(window, 'SpeechRecognition', { configurable: true, writable: true, value: undefined });
      Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, writable: true, value: undefined });
      return;
    }

    class FakeSpeech {
      continuous = false;
      interimResults = false;
      lang = '';
      onresult: ((event: { results: unknown }) => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;

      start() {
        probe.starts += 1;
        probe.current = this;
        if (mode === 'denied-speech') {
          queueMicrotask(() => {
            this.onerror?.({ error: 'not-allowed' });
            this.onend?.();
          });
        }
      }

      stop() {
        this.onend?.();
      }

      abort() {
        probe.aborts += 1;
        this.onend?.();
      }
    }

    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, writable: true, value: FakeSpeech });
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, writable: true, value: FakeSpeech });

    const track = {
      kind: 'audio',
      stop() {
        probe.trackStops += 1;
      },
    };
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      probe.meterAsks += 1;
      probe.constraints = constraints as { audio?: boolean };
      if (mode === 'denied-meter') throw new DOMException('Permission denied', 'NotAllowedError');
      return { getTracks: () => [track] } as unknown as MediaStream;
    };

    class FakeAudioContext {
      state: AudioContextState = 'running';
      constructor() {
        probe.contexts += 1;
        if (mode === 'fight') {
          queueMicrotask(() => {
            probe.current?.onerror?.({ error: 'audio-capture' });
            probe.current?.onend?.();
          });
        }
      }
      resume() {
        return Promise.resolve();
      }
      close() {
        probe.closes += 1;
        return Promise.resolve();
      }
      createMediaStreamSource() {
        return { connect() {}, disconnect() {} };
      }
      createAnalyser() {
        return {
          fftSize: 256,
          getByteTimeDomainData(buffer: Uint8Array) {
            probe.sampleReads += 1;
            buffer.fill(128 + Math.round(probe.level * 64));
          },
        };
      }
    }
    window.AudioContext = FakeAudioContext as unknown as typeof AudioContext;

    window.MediaRecorder = class {
      constructor() {
        probe.recorders += 1;
      }
    } as unknown as typeof MediaRecorder;
  }, mode);
}

export function dictationProbe(page: Page): Promise<DictationProbe> {
  return page.evaluate(() => {
    const probe = (window as unknown as { __dictation: DictationProbe }).__dictation;
    return {
      starts: probe.starts,
      aborts: probe.aborts,
      meterAsks: probe.meterAsks,
      trackStops: probe.trackStops,
      contexts: probe.contexts,
      closes: probe.closes,
      sampleReads: probe.sampleReads,
      recorders: probe.recorders,
      constraints: probe.constraints,
    };
  });
}

/** Speaks one result list into the recognizer that is current in the page. */
export async function speak(page: Page, results: { final: boolean; text: string }[]) {
  await page.evaluate((results) => {
    const probe = (window as unknown as { __dictation: { current: { onresult: ((event: { results: unknown }) => void) | null } | null } }).__dictation;
    probe.current?.onresult?.({
      results: results.map((result) => ({ isFinal: result.final, 0: { transcript: result.text } })),
    });
  }, results);
}
