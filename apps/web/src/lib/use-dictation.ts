import { CAPTURE_MAX_CHARS } from '@app/core';
import { useEffect, useRef, useState } from 'react';
import { browserRecognition, createDictation, joinNote, type DictationControl, type Meter } from './dictation';
import { openLocalMeter } from './local-meter';

/** The capture note, with Web Speech that starts only when Dictate is pressed. */
export function useCaptureDictation(enabled: boolean) {
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [showMeter, setShowMeter] = useState(false);
  const [level, setLevel] = useState(0);
  const [message, setMessage] = useState('');
  const textRef = useRef('');
  const writtenRef = useRef('');
  const baseRef = useRef('');
  const meterRef = useRef<Meter | null>(null);
  const control = useRef<DictationControl | null>(null);

  if (!control.current) {
    control.current = createDictation(
      {
        recognition: browserRecognition,
        async openMeter() {
          const local = await openLocalMeter();
          const handle: Meter = {
            level: () => local.level(),
            stop() {
              local.stop();
              if (meterRef.current === handle) meterRef.current = null;
            },
          };
          meterRef.current = handle;
          return handle;
        },
        lang: () => navigator.language || 'en-US',
      },
      {
        spoken(spoken) {
          const next = joinNote(baseRef.current, spoken, CAPTURE_MAX_CHARS);
          writtenRef.current = next;
          textRef.current = next;
          setText(next);
          if (next.length >= CAPTURE_MAX_CHARS) control.current?.stop();
        },
        committed(spoken) {
          const next = joinNote(baseRef.current, spoken, CAPTURE_MAX_CHARS);
          baseRef.current = next;
          writtenRef.current = next;
          textRef.current = next;
          setText(next);
        },
        listening(on) {
          setListening(on);
          if (!on) setLevel(0);
        },
        meter(on) {
          setShowMeter(on);
          if (!on) setLevel(0);
        },
        message(next) {
          setMessage(next);
        },
      },
    );
  }

  useEffect(() => {
    if (!enabled) control.current?.stop();
  }, [enabled]);

  useEffect(() => () => control.current?.stop(), []);

  useEffect(() => {
    if (!showMeter) return;
    let frame = 0;
    const tick = () => {
      const meter = meterRef.current;
      if (meter) {
        try {
          const next = Math.min(1, Math.max(0, meter.level()));
          setLevel((prev) => (Math.abs(prev - next) < 0.02 ? prev : next));
        } catch {
          control.current?.dropMeter();
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [showMeter]);

  return {
    text,
    listening,
    showMeter: enabled && showMeter,
    level,
    message: enabled ? message : '',
    edit(value: string) {
      textRef.current = value;
      setText(value);
      if (value === writtenRef.current) return;
      writtenRef.current = value;
      baseRef.current = value;
      control.current?.noteEdited();
    },
    press() {
      baseRef.current = textRef.current;
      control.current?.press();
    },
  };
}
