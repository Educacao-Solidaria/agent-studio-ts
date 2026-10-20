import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  type CompletionSound,
  CompletionSoundToggle,
  LONG_MS,
  useCompletionSound,
} from "./completion-sound.tsx";

const KEY = "agent-studio:som-ao-concluir";

/** AudioContext de mentira: nasce suspenso (como o real fora de um gesto) e anota cada toque. */
class FakeAudio {
  static made: FakeAudio[] = [];
  state = "suspended";
  currentTime = 5;
  destination = {};
  tones: number[] = [];
  peaks: number[] = [];
  resume = vi.fn(async () => {
    this.state = "running";
  });
  constructor() {
    FakeAudio.made.push(this);
  }
  createOscillator() {
    const tone = { frequency: { value: 0 }, connect: (node: unknown) => node, stop: () => {} };
    return Object.assign(tone, { start: () => this.tones.push(tone.frequency.value) });
  }
  createGain() {
    const ramp = (value: number) => this.peaks.push(value);
    const gain = {
      setValueAtTime() {},
      linearRampToValueAtTime: ramp,
      exponentialRampToValueAtTime() {},
    };
    return { gain, connect: (node: unknown) => node };
  }
}

let sound: CompletionSound;
function Panel() {
  sound = useCompletionSound();
  return <CompletionSoundToggle sound={sound} />;
}
const box = () => screen.getByRole("checkbox", { name: "Som ao concluir" }) as HTMLInputElement;
const status = () => screen.getByRole("status").textContent?.replace(/\s/g, " ");
const hideTab = () =>
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });

beforeEach(() => {
  localStorage.clear();
  FakeAudio.made = [];
  vi.stubGlobal("AudioContext", FakeAudio);
});
afterEach(() => Reflect.deleteProperty(document, "visibilityState"));

it("desligado por padrão; ligar é o gesto: guarda, destrava o áudio e toca uma prévia", async () => {
  render(<Panel />);
  expect([box().checked, FakeAudio.made.length]).toEqual([false, 0]);
  await act(async () => fireEvent.click(box()));
  expect([box().checked, localStorage.getItem(KEY)]).toEqual([true, "on"]);
  const [audio] = FakeAudio.made;
  expect(audio?.resume).toHaveBeenCalledOnce();
  expect(audio?.tones).toEqual([660, 880]);
  expect(Math.max(...(audio?.peaks ?? []))).toBeLessThanOrEqual(0.1); // discreto
});

it("conclusão longa ou com a aba oculta: aviso por texto e som; curta e à vista: nada", async () => {
  render(<Panel />);
  await act(async () => fireEvent.click(box()));
  const [audio] = FakeAudio.made;
  act(() => sound.notify(LONG_MS + 2_000));
  expect([status(), audio?.tones.length]).toEqual(["Resposta concluída em 12 s.", 4]);
  act(() => sound.notify(3_000));
  expect([status(), audio?.tones.length]).toEqual(["Resposta concluída em 12 s.", 4]);
  hideTab();
  act(() => sound.notify(3_000));
  expect([status(), audio?.tones.length]).toEqual(["Resposta concluída em 3 s.", 6]);
});

it("som desligado: o aviso por texto sai do mesmo jeito (nunca só som) e nada toca", () => {
  render(<Panel />);
  act(() => sound.notify(LONG_MS));
  fireEvent.pointerDown(document.body); // desligado, gesto nenhum cria áudio
  expect([status(), FakeAudio.made.length]).toEqual(["Resposta concluída em 10 s.", 0]);
});

it("preferência já ligada não toca antes de um gesto; o primeiro toque na página destrava", async () => {
  localStorage.setItem(KEY, "on");
  render(<Panel />);
  expect(box().checked).toBe(true);
  act(() => sound.notify(LONG_MS));
  expect([status(), FakeAudio.made.length]).toEqual(["Resposta concluída em 10 s.", 0]);
  await act(async () => fireEvent.pointerDown(document.body));
  act(() => sound.notify(LONG_MS + 1_000));
  expect(FakeAudio.made[0]?.tones).toEqual([660, 880]);
  Object.assign(FakeAudio.made[0] ?? {}, { state: "interrupted" }); // iOS: tocaria fora de hora
  act(() => sound.notify(LONG_MS + 2_000));
  expect(FakeAudio.made[0]?.tones).toHaveLength(2);
});

it("ligar no meio de um envio vale para ele; desligar guarda e cala", async () => {
  render(<Panel />);
  const notifyFromSend = sound.notify; // o painel guardou o `notify` quando a resposta começou
  await act(async () => fireEvent.click(box()));
  const [audio] = FakeAudio.made;
  act(() => notifyFromSend(LONG_MS));
  expect(audio?.tones).toHaveLength(4); // prévia + conclusão
  await act(async () => fireEvent.click(box()));
  act(() => notifyFromSend(LONG_MS));
  expect([localStorage.getItem(KEY), audio?.tones.length]).toEqual([null, 4]);
});

it("localStorage que lança e navegador sem AudioContext: desligado e sem erro", async () => {
  const blocked = () => {
    throw new DOMException("bloqueado", "SecurityError");
  };
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);
  vi.stubGlobal("AudioContext", undefined);
  render(<Panel />);
  expect(box().checked).toBe(false);
  await act(async () => fireEvent.click(box())); // vale para esta visita
  act(() => sound.notify(LONG_MS));
  expect([box().checked, status()]).toEqual([true, "Resposta concluída em 10 s."]);
});

it("duração NaN: à vista não é longa; com a aba oculta, aviso sem número", () => {
  render(<Panel />);
  act(() => sound.notify(Number.NaN));
  expect(status()).toBe("");
  hideTab();
  act(() => sound.notify(Number.NaN));
  expect(status()).toBe("Resposta concluída.");
});
