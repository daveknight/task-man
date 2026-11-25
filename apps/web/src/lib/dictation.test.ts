import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DICTATION_BLOCKED,
  DICTATION_FAILED,
  DICTATION_NO_MICROPHONE,
  DICTATION_UNAVAILABLE,
  adaptRecognition,
  collectTranscript,
  createDictation,
  joinNote,
  type DictationListener,
  type NativeRecognition,
  type SpeechSession,
} from './dictation.ts';

class FakeSession implements SpeechSession {
  continuous = false;
  interimResults = false;
  lang = '';
  onresult: SpeechSession['onresult'] = null;
  onerror: SpeechSession['onerror'] = null;
  onend: SpeechSession['onend'] = null;
  starts = 0;
  aborts = 0;
  failStart = false;

  start() {
    this.starts += 1;
    if (this.failStart) throw new Error('nope');
  }

  stop() {
    this.onend?.();
  }

  abort() {
    this.aborts += 1;
    this.onend?.();
  }
}

function harness(options?: { recognition?: boolean; meter?: 'ok' | 'deny' }) {
  const sessions: FakeSession[] = [];
  const meters: { stopped: boolean }[] = [];
  let meterCalls = 0;
  const events = {
    spoken: [] as string[],
    committed: [] as string[],
    listening: [] as boolean[],
    meter: [] as boolean[],
    messages: [] as string[],
  };
  const listener: DictationListener = {
    spoken(text) {
      events.spoken.push(text);
    },
    committed(text) {
      events.committed.push(text);
    },
    listening(on) {
      events.listening.push(on);
    },
    meter(on) {
      events.meter.push(on);
    },
    message(text) {
      events.messages.push(text);
    },
  };
  const dictation = createDictation(
    {
      recognition() {
        if (options?.recognition === false) return null;
        const session = new FakeSession();
        sessions.push(session);
        return session;
      },
      async openMeter() {
        meterCalls += 1;
        if (options?.meter === 'deny') throw new DOMException('denied', 'NotAllowedError');
        const meter = {
          stopped: false,
          level: () => 0.5,
          stop() {
            this.stopped = true;
          },
        };
        meters.push(meter);
        return meter;
      },
      lang: () => 'en-US',
    },
    listener,
  );
  return {
    dictation,
    sessions,
    meters,
    events,
    meterCalls: () => meterCalls,
  };
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('joinNote', () => {
  it('appends speech after a space and keeps a typed trailing space', () => {
    assert.equal(joinNote('', '  buy milk  '), 'buy milk');
    assert.equal(joinNote('Buy', 'milk'), 'Buy milk');
    assert.equal(joinNote('Buy ', 'milk'), 'Buy milk');
    assert.equal(joinNote('Buy', ''), 'Buy');
  });

  it('stops at the note cap', () => {
    assert.equal(joinNote('Buy', 'milkshakes', 8), 'Buy milk');
  });
});

describe('collectTranscript', () => {
  it('keeps finished speech apart from the live interim', () => {
    assert.deepEqual(
      collectTranscript([
        { isFinal: true, transcript: 'hello' },
        { isFinal: true, transcript: ' there' },
        { isFinal: false, transcript: ' friend' },
      ]),
      { finalText: 'hello there', interim: ' friend' },
    );
  });
});

describe('adaptRecognition', () => {
  it('sets continuous interim recognition in the page language and maps transcripts', () => {
    let seen: { continuous: boolean; interimResults: boolean; lang: string } | null = null;
    const native: NativeRecognition = {
      continuous: false,
      interimResults: false,
      lang: '',
      onresult: null,
      onerror: null,
      onend: null,
      start() {
        seen = { continuous: this.continuous, interimResults: this.interimResults, lang: this.lang };
      },
      stop() {
        this.onend?.();
      },
      abort() {
        this.onend?.();
      },
    };
    const session = adaptRecognition(native);
    const heard: { finalText: string; interim: string }[] = [];
    session.onresult = (results) => heard.push(collectTranscript(results));
    session.continuous = true;
    session.interimResults = true;
    session.lang = 'en-US';
    session.start();
    native.onresult?.({
      results: [
        { isFinal: true, 0: { transcript: 'buy milk' } },
        { isFinal: false, 0: { transcript: ' tomorrow' } },
      ],
    });
    assert.deepEqual(seen, { continuous: true, interimResults: true, lang: 'en-US' });
    assert.deepEqual(heard, [{ finalText: 'buy milk', interim: ' tomorrow' }]);
  });
});

describe('createDictation', () => {
  it('does not ask for the microphone until Dictate is pressed', () => {
    const h = harness();
    assert.equal(h.sessions.length, 0);
    assert.equal(h.meterCalls(), 0);
  });

  it('leaves the note usable when the speech API is missing', () => {
    const h = harness({ recognition: false });
    h.dictation.press();
    assert.deepEqual(h.events.messages, [DICTATION_UNAVAILABLE]);
    assert.equal(h.meterCalls(), 0);
    assert.equal(h.events.listening.length, 0);
  });

  it('starts Web Speech and a local meter on press', async () => {
    const h = harness();
    h.dictation.press();
    const session = h.sessions[0]!;
    assert.equal(session.starts, 1);
    assert.equal(session.continuous, true);
    assert.equal(session.interimResults, true);
    assert.equal(session.lang, 'en-US');
    assert.equal(h.events.listening.at(-1), true);
    await flush();
    assert.equal(h.meterCalls(), 1);
    assert.equal(h.events.meter.at(-1), true);
    session.onresult?.([{ isFinal: false, transcript: 'buy' }]);
    assert.equal(h.events.spoken.at(-1), 'buy');
    session.onresult?.([
      { isFinal: true, transcript: 'buy milk' },
      { isFinal: false, transcript: ' tomorrow' },
    ]);
    assert.equal(h.events.spoken.at(-1), 'buy milk tomorrow');
  });

  it('keeps dictating when the meter is refused', async () => {
    const h = harness({ meter: 'deny' });
    h.dictation.press();
    await flush();
    assert.equal(h.events.meter.length, 0);
    assert.equal(h.events.messages.length, 0);
    h.sessions[0]!.onresult?.([{ isFinal: true, transcript: 'buy milk' }]);
    assert.equal(h.events.spoken.at(-1), 'buy milk');
    assert.equal(h.events.listening.at(-1), true);
  });

  it('drops the meter and keeps dictating when the meter fights recognition', async () => {
    const h = harness();
    h.dictation.press();
    await flush();
    const first = h.sessions[0]!;
    first.onresult?.([{ isFinal: true, transcript: 'hello' }]);
    first.onerror?.('audio-capture');
    first.onend?.();
    await flush();
    assert.equal(h.meters[0]!.stopped, true);
    assert.equal(h.events.meter.at(-1), false);
    assert.equal(h.events.committed.at(-1), 'hello');
    assert.equal(h.sessions.length, 2);
    assert.equal(h.meterCalls(), 1);
    h.sessions[1]!.onresult?.([{ isFinal: true, transcript: 'again' }]);
    assert.equal(h.events.spoken.at(-1), 'again');
    assert.equal(h.events.listening.at(-1), true);
  });

  it('stops after a second audio failure once the meter is gone', async () => {
    const h = harness();
    h.dictation.press();
    await flush();
    h.sessions[0]!.onerror?.('audio-capture');
    h.sessions[0]!.onend?.();
    await flush();
    h.sessions[1]!.onerror?.('audio-capture');
    h.sessions[1]!.onend?.();
    assert.equal(h.events.messages.at(-1), DICTATION_NO_MICROPHONE);
    assert.equal(h.events.listening.at(-1), false);
    assert.equal(h.sessions.length, 2);
  });

  it('restarts on silence and keeps the meter', async () => {
    const h = harness();
    h.dictation.press();
    await flush();
    h.sessions[0]!.onerror?.('no-speech');
    h.sessions[0]!.onend?.();
    await flush();
    assert.equal(h.sessions.length, 2);
    assert.equal(h.meters[0]!.stopped, false);
    assert.equal(h.events.meter.at(-1), true);
    assert.equal(h.meterCalls(), 1);
  });

  it('stops and explains when the microphone is blocked', async () => {
    const h = harness();
    h.dictation.press();
    await flush();
    h.sessions[0]!.onerror?.('not-allowed');
    h.sessions[0]!.onend?.();
    assert.equal(h.events.messages.at(-1), DICTATION_BLOCKED);
    assert.equal(h.events.listening.at(-1), false);
    assert.equal(h.meters[0]!.stopped, true);
    assert.equal(h.sessions.length, 1);
  });

  it('stops and explains when recognition cannot start', () => {
    const session = new FakeSession();
    session.failStart = true;
    const listening: boolean[] = [];
    const messages: string[] = [];
    let meterCalls = 0;
    const dictation = createDictation(
      {
        recognition: () => session,
        async openMeter() {
          meterCalls += 1;
          throw new Error('should not open');
        },
        lang: () => 'en-US',
      },
      {
        spoken() {},
        committed() {},
        listening(on) {
          listening.push(on);
        },
        meter() {},
        message(text) {
          messages.push(text);
        },
      },
    );
    dictation.press();
    assert.equal(messages.at(-1), DICTATION_FAILED);
    assert.equal(listening.at(-1), false);
    assert.equal(session.starts, 1);
    assert.equal(meterCalls, 0);
  });

  it('stops listening and the meter on request, and ignores a late result', async () => {
    const h = harness();
    h.dictation.press();
    await flush();
    h.dictation.stop();
    h.sessions[0]!.onresult?.([{ isFinal: true, transcript: 'nope' }]);
    h.sessions[0]!.onend?.();
    assert.deepEqual(h.events.spoken, []);
    assert.equal(h.events.listening.at(-1), false);
    assert.equal(h.sessions[0]!.aborts, 1);
    assert.equal(h.meters[0]!.stopped, true);
    assert.equal(h.sessions.length, 1);
  });

  it('treats an edit as a new utterance so earlier interim is not appended again', async () => {
    const h = harness();
    h.dictation.press();
    await flush();
    h.sessions[0]!.onresult?.([{ isFinal: false, transcript: 'buy' }]);
    h.dictation.noteEdited();
    h.sessions[0]!.onresult?.([{ isFinal: true, transcript: 'buy milk' }]);
    assert.deepEqual(h.events.spoken, ['buy']);
    assert.equal(h.sessions.length, 2);
    assert.equal(h.sessions[0]!.aborts, 1);
    h.sessions[1]!.onresult?.([{ isFinal: true, transcript: 'tomorrow' }]);
    assert.equal(h.events.spoken.at(-1), 'tomorrow');
    assert.equal(h.meters[0]!.stopped, false);
  });
});
