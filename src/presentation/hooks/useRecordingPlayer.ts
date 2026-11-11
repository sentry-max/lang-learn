import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Plays recordings one after another. `play` resolves when the last one ends or playback is stopped, and rejects
 * when a recording can't be played. Only one sequence plays at a time; it stops when the screen closes.
 */
export function useRecordingPlayer() {
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const runIdRef = useRef(0);

  const stop = useCallback(() => {
    runIdRef.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingKey(null);
  }, []);

  useEffect(() => stop, [stop]);

  const play = useCallback(
    async (key: string, urls: string[]) => {
      stop();
      const runId = runIdRef.current;
      setPlayingKey(key);
      try {
        for (const url of urls) {
          if (runId !== runIdRef.current) return;
          const audio = new Audio(url);
          audioRef.current = audio;
          await new Promise<void>((resolve, reject) => {
            audio.onended = () => resolve();
            audio.onpause = () => resolve();
            audio.onerror = () => reject(new Error(`The recording at ${url} can't be played.`));
            audio.play().catch(reject);
          });
        }
      } finally {
        if (runId === runIdRef.current) {
          audioRef.current = null;
          setPlayingKey(null);
        }
      }
    },
    [stop]
  );

  return { playingKey, play, stop };
}
