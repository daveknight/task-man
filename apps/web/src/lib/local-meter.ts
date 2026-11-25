import type { Meter } from './dictation';

function newAudioContext(): AudioContext {
  const win = window as Window & { webkitAudioContext?: typeof AudioContext };
  const Ctor = window.AudioContext ?? win.webkitAudioContext;
  if (!Ctor) throw new Error('no-meter');
  return new Ctor();
}

function stopTracks(stream: MediaStream) {
  for (const track of stream.getTracks()) track.stop();
}

/**
 * A microphone level for the capture meter. Samples are read by an AnalyserNode and never leave
 * the page: the stream is not recorded and not connected to the audio output.
 * Throws when the browser refuses the microphone or can't share it with speech recognition.
 */
export async function openLocalMeter(): Promise<Meter> {
  const getUserMedia = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
  if (!getUserMedia) throw new Error('no-meter');
  const stream = await getUserMedia({ audio: true });
  let context: AudioContext | null = null;
  try {
    context = newAudioContext();
    if (context.state === 'suspended') await context.resume();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let stopped = false;
    return {
      level() {
        if (stopped) return 0;
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let index = 0; index < data.length; index++) {
          const centered = ((data[index] ?? 128) - 128) / 128;
          sum += centered * centered;
        }
        return Math.min(1, Math.sqrt(sum / data.length) * 4);
      },
      stop() {
        if (stopped) return;
        stopped = true;
        try {
          source.disconnect();
        } catch {
          // The node was already disconnected.
        }
        stopTracks(stream);
        void context?.close();
      },
    };
  } catch (error) {
    stopTracks(stream);
    if (context) void context.close();
    throw error;
  }
}
