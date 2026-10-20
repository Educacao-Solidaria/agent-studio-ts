import { act, render, screen } from "@testing-library/react";
import { delay, HttpResponse, http } from "msw";
import { afterEach, expect, it, vi } from "vitest";
import { server } from "../mocks/node.ts";
import { checkHealth, OfflineBanner, type Service } from "./offline-banner.tsx";

const GATEWAY: Service = { name: "Gateway", url: "http://gateway.test/healthz" };
const RAG: Service = { name: "RAG", url: "http://rag.test/healthz" };
const OFFLINE =
  "Sem conexão com a internet. Os serviços voltam a ser checados quando a rede voltar.";
const banner = () => screen.getByRole("status").textContent;
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
// Só setTimeout e Date: o agendador do React (setImmediate/MessageChannel) segue real.
const fakeTimers = (now = 0) =>
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], now });

/** Saúde decidida pelo teste (`health[url]`, padrão de pé); cada checagem anota url e hora. */
function fake(health: Record<string, boolean> = {}) {
  const calls: { url: string; at: number }[] = [];
  const check = async (url: string) => {
    calls.push({ url, at: Date.now() });
    return health[url] ?? true;
  };
  return { check, calls, health };
}

/** Checagem que só responde quando o teste chama `release`. */
function deferred() {
  const signals: AbortSignal[] = [];
  let release = (_ok: boolean) => {};
  const check = (_url: string, signal: AbortSignal) => {
    signals.push(signal);
    return new Promise<boolean>((done) => {
      release = done;
    });
  };
  return { check, signals, release: (ok: boolean) => act(async () => release(ok)) };
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => value });
  act(() => window.dispatchEvent(new Event(value ? "online" : "offline")));
}

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, "onLine"); // volta ao getter do jsdom
});

it("uma falha isolada não avisa; seguidas avisam, juntam os nomes e a volta é anunciada", async () => {
  fakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(1); // jitter no teto: esperas exatas
  const { check, health } = fake({ [RAG.url]: false });
  render(<OfflineBanner services={[GATEWAY, RAG]} check={check} />);
  await advance(0);
  expect(banner()).toBe(""); // 1ª falha do RAG
  await advance(2000);
  expect(banner()).toBe("Serviço indisponível: RAG. Tentando de novo…");
  health[GATEWAY.url] = false;
  await advance(30_000);
  expect(banner()).toBe("Serviços indisponíveis: RAG e Gateway. Tentando de novo…");
  Object.assign(health, { [GATEWAY.url]: true, [RAG.url]: true });
  await advance(4000); // t = 36 s: o gateway volta antes do RAG
  expect(banner()).toBe("Serviço indisponível: RAG. Tentando de novo…");
  await advance(26_000); // t = 62 s: o RAG também
  expect(banner()).toBe("Conexão restabelecida.");
  await advance(5000);
  expect(banner()).toBe("");
  expect(screen.getByRole("status").className).toBe(""); // some da tela, mas segue montada
});

it("falhando, a espera dobra até o teto; de pé, volta ao intervalo", async () => {
  fakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(1);
  const { check, calls, health } = fake({ [RAG.url]: false });
  render(<OfflineBanner services={[RAG]} check={check} maxDelayMs={10_000} />);
  await advance(34_000);
  health[RAG.url] = true;
  await advance(10_000 + 30_000);
  const gaps = calls.slice(1).map((call, i) => call.at - (calls[i]?.at ?? 0));
  expect(gaps).toEqual([2000, 4000, 8000, 10_000, 10_000, 10_000, 30_000]);
});

it("navegador offline avisa na hora; online checa de novo sem esperar o intervalo", async () => {
  fakeTimers();
  const { check, calls } = fake();
  render(<OfflineBanner services={[GATEWAY]} check={check} />);
  await advance(0);
  setOnline(false);
  expect(banner()).toBe(OFFLINE);
  setOnline(true);
  await advance(0);
  expect(calls).toHaveLength(2);
  expect(banner()).toBe("Conexão restabelecida.");
});

it("online no meio de uma checagem não a duplica; depois troca o timer em vez de somar", async () => {
  fakeTimers();
  const { check, signals, release } = deferred();
  render(<OfflineBanner services={[GATEWAY]} check={check} />);
  setOnline(true);
  expect(signals).toHaveLength(1); // a checagem em curso já agenda a próxima
  await release(true);
  setOnline(true);
  expect(signals).toHaveLength(2);
  await release(true);
  await advance(30_000);
  expect(signals).toHaveLength(3); // um timer só, não o velho mais o novo
});

it("check que lança na hora conta como falha e não trava o serviço", async () => {
  fakeTimers();
  const check = (): Promise<boolean> => {
    throw new Error("sem rede");
  };
  render(<OfflineBanner services={[RAG]} check={check} />);
  await advance(2000);
  expect(banner()).toBe("Serviço indisponível: RAG. Tentando de novo…");
});

it("começa offline se o navegador já está offline", () => {
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
  render(<OfflineBanner services={[]} check={fake().check} />);
  expect(banner()).toBe(OFFLINE);
});

it("mesma lista em array novo não reinicia; a check nova vale na próxima; quem sai, sai do aviso", async () => {
  fakeTimers();
  const first = fake({ [RAG.url]: false });
  const second = fake({ [RAG.url]: false });
  const view = (services: Service[], check = first.check) => (
    <OfflineBanner services={services} check={check} threshold={1} />
  );
  const { rerender } = render(view([GATEWAY, RAG]));
  await advance(0);
  expect(banner()).toContain("RAG");
  rerender(view([{ ...GATEWAY }, { ...RAG }], second.check));
  await advance(0);
  expect(first.calls).toHaveLength(2); // nada reiniciou
  await advance(2000); // o RAG tenta de novo (espera de 1 a 2 s) já com a check nova
  expect(second.calls.map((call) => call.url)).toEqual([RAG.url]);
  rerender(view([GATEWAY], second.check));
  await advance(0);
  expect(banner()).not.toContain("RAG");
});

it("opção degenerada não vira laço contra o servidor nem aviso falso", async () => {
  fakeTimers();
  const { check, calls } = fake();
  const odd = { intervalMs: 0, threshold: 0, baseDelayMs: Number.NaN, maxDelayMs: -1 };
  render(<OfflineBanner services={[GATEWAY]} check={check} {...odd} />);
  await advance(999);
  expect(calls).toHaveLength(1); // intervalo mínimo de 1 s
  expect(banner()).toBe(""); // threshold 0 vale 1: quem está de pé não é marcado
  await advance(1);
  expect(calls).toHaveLength(2);
});

it("desmontar aborta a checagem em curso e não deixa timer nem ouvinte", async () => {
  fakeTimers();
  const late = deferred();
  const check = (url: string, signal: AbortSignal) =>
    url === GATEWAY.url ? Promise.resolve(true) : late.check(url, signal);
  const { unmount } = render(<OfflineBanner services={[GATEWAY, RAG]} check={check} />);
  await advance(0);
  expect(vi.getTimerCount()).toBe(1); // a próxima do gateway
  unmount();
  expect(late.signals[0]?.aborted).toBe(true);
  await late.release(true); // a resposta que chega depois não agenda nada
  setOnline(true); // e o evento da rede já não chega
  expect(vi.getTimerCount()).toBe(0);
  expect(late.signals).toHaveLength(1);
});

it("checkHealth: 2xx de pé; 503, sem rede, prazo estourado e abortado, não", async () => {
  let cache = "";
  let slow: AbortSignal | undefined;
  server.use(
    http.get(GATEWAY.url, ({ request }) => {
      cache = request.cache;
      return HttpResponse.json({ status: "ok" });
    }),
    http.get(RAG.url, () => HttpResponse.json({ status: "unavailable" }, { status: 503 })),
    http.get("http://off.test/healthz", () => HttpResponse.error()),
    http.get("http://slow.test/healthz", async ({ request }) => {
      slow = request.signal;
      await delay("infinite");
    }),
  );
  const signal = new AbortController().signal;
  expect(await checkHealth(GATEWAY.url, signal)).toBe(true);
  expect(cache).toBe("no-store");
  expect(await checkHealth(RAG.url, signal)).toBe(false);
  expect(await checkHealth("http://off.test/healthz", signal)).toBe(false);
  expect(await checkHealth("http://slow.test/healthz", signal, 50)).toBe(false);
  expect(slow?.aborted).toBe(true); // o prazo fecha o pedido
  expect(await checkHealth(GATEWAY.url, AbortSignal.abort())).toBe(false);
  const outer = new AbortController(); // abortar por fora fecha o pedido em curso
  const pending = checkHealth("http://slow.test/healthz", outer.signal, 60_000);
  await vi.waitFor(() => expect(slow?.aborted).toBe(false));
  outer.abort();
  expect(await pending).toBe(false);
  expect(slow?.aborted).toBe(true);
});
