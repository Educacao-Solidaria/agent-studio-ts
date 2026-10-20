import { useCallback, useEffect, useRef, useState } from "react";
import { formatDuration } from "../lib/format.ts";

const PREFERENCE = "agent-studio:som-ao-concluir";
/** A partir disto a geração é "longa": vale avisar mesmo com a aba à vista. */
export const LONG_MS = 10_000;

// localStorage pode lançar (modo privado, cota, política do navegador): sem ele, fica desligado.
function readPreference() {
  try {
    return localStorage.getItem(PREFERENCE) === "on";
  } catch {
    return false;
  }
}

function savePreference(on: boolean) {
  try {
    if (on) localStorage.setItem(PREFERENCE, "on");
    else localStorage.removeItem(PREFERENCE);
  } catch {
    // a preferência vale só nesta visita
  }
}

/** Dois toques curtos e baixos, gerados na hora (Web Audio, sem arquivo de áudio). */
export function playChime(audio: AudioContext) {
  for (const [index, frequency] of [660, 880].entries()) {
    const at = audio.currentTime + index * 0.14;
    const tone = audio.createOscillator();
    const volume = audio.createGain();
    tone.frequency.value = frequency;
    volume.gain.setValueAtTime(0, at);
    volume.gain.linearRampToValueAtTime(0.08, at + 0.01); // sobe e desce em rampa: sem estalo
    volume.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
    tone.connect(volume).connect(audio.destination);
    tone.start(at);
    tone.stop(at + 0.13);
  }
}

/**
 * Aviso de conclusão: desligado até a pessoa ligar (preferência guardada). Só avisa em geração
 * longa ou com a aba oculta, e nunca só com som: o texto do aviso sai sempre (`announcement`,
 * para um `role="status"`), o som vai junto se ligado. O áudio só destrava num gesto (política de
 * autoplay): no clique que liga, ou no primeiro toque/tecla da página quando já vinha ligado.
 */
export function useCompletionSound(longMs = LONG_MS) {
  const [enabled, setEnabled] = useState(readPreference);
  const [announcement, setAnnouncement] = useState("");
  const audio = useRef<AudioContext | undefined>(undefined);
  // O painel chama `notify` no fim de um envio que começou antes: lê a preferência de agora.
  const on = useRef(enabled);
  on.current = enabled;
  const unlock = useCallback(() => {
    if (typeof AudioContext === "undefined") return Promise.resolve(undefined);
    audio.current ??= new AudioContext();
    const context = audio.current;
    return context.resume().then(
      () => context,
      () => undefined,
    );
  }, []);

  useEffect(() => {
    if (!enabled || audio.current) return;
    const options = { capture: true, once: true } as const;
    document.addEventListener("pointerdown", unlock, options);
    document.addEventListener("keydown", unlock, options);
    return () => {
      document.removeEventListener("pointerdown", unlock, options);
      document.removeEventListener("keydown", unlock, options);
    };
  }, [enabled, unlock]);

  const toggle = () => {
    savePreference(!enabled);
    setEnabled(!enabled);
    // Ligar é o gesto: destrava e toca uma vez, para a pessoa saber como soa.
    if (!enabled) unlock().then((context) => context && playChime(context));
  };

  const notify = useCallback(
    (durationMs: number) => {
      const hidden = document.visibilityState === "hidden";
      if (!(durationMs >= longMs) && !hidden) return; // NaN não é longa
      const took = Number.isFinite(durationMs) ? ` em ${formatDuration(durationMs)}` : "";
      setAnnouncement(`Resposta concluída${took}.`);
      const context = audio.current;
      if (on.current && context?.state === "running") playChime(context);
    },
    [longMs],
  );

  return { enabled, toggle, notify, announcement };
}

export type CompletionSound = ReturnType<typeof useCompletionSound>;

/** A chave do som e o aviso por texto da última conclusão (o painel chama `notify`). */
export function CompletionSoundToggle({ sound }: { sound: CompletionSound }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <label
        className="inline-flex items-center gap-2"
        title="Só em respostas longas ou com a aba em segundo plano"
      >
        <input type="checkbox" checked={sound.enabled} onChange={sound.toggle} />
        Som ao concluir
      </label>
      <p role="status" className="text-muted-foreground">
        {sound.announcement}
      </p>
    </div>
  );
}
