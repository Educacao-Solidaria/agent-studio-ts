import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { backoffDelay } from "../chat/sse-reader.ts";
import { cn } from "../lib/cn.ts";
import { Icon } from "./icons.tsx";

/** Um serviço do backend e a rota de saúde dele (`/healthz`); o nome (único na lista) é o que aparece. */
export type Service = { name: string; url: string };
export type Check = (url: string, signal: AbortSignal) => Promise<boolean>;
export type ConnectivityOptions = {
  /** Entre checagens com o serviço de pé (mínimo 1 s). */
  intervalMs?: number;
  /** Falhas seguidas até avisar: uma falha isolada não é "fora do ar". */
  threshold?: number;
  /** Depois de falhar, a próxima tentativa dobra a partir daqui (com jitter) até o teto. */
  baseDelayMs?: number;
  maxDelayMs?: number;
  check?: Check;
};

const OFFLINE =
  "Sem conexão com a internet. Os serviços voltam a ser checados quando a rede voltar.";
const RECOVERED_MS = 5000;
const list = new Intl.ListFormat("pt-BR", { type: "conjunction" });
/** Opção degenerada (0, negativa, NaN) não pode virar checagem em laço contra o servidor. */
const atLeast = (value: number, min: number, fallback: number) =>
  Number.isFinite(value) ? Math.max(min, value) : fallback;

/** `GET` sem cache e com prazo: de pé = respondeu 2xx (503 do `/healthz` é dependência caída). */
export async function checkHealth(url: string, signal: AbortSignal, timeoutMs = 5000) {
  if (signal.aborted) return false;
  const request = new AbortController();
  const abort = () => request.abort();
  const timer = setTimeout(abort, timeoutMs);
  signal.addEventListener("abort", abort, { once: true });
  try {
    return (await fetch(url, { cache: "no-store", signal: request.signal })).ok;
  } catch {
    return false; // sem rede, CORS, DNS ou prazo: inacessível
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}

/** Liga ou desliga `name` na lista, devolvendo a MESMA lista quando nada muda (sem render). */
const toggle = (names: readonly string[], name: string, on: boolean) => {
  if (names.includes(name) === on) return names;
  return on ? [...names, name] : names.filter((other) => other !== name);
};

/**
 * `navigator.onLine` e a saúde de cada serviço: `up` respondeu bem na última checagem; `down`
 * falhou `threshold` vezes seguidas. Em nenhum dos dois: ainda sem resposta, ou falhou abaixo do
 * limite e está tentando de novo.
 */
export type Connectivity = { online: boolean; down: readonly string[]; up: readonly string[] };

/** Uma sondagem por serviço; o resultado serve à faixa e às lâmpadas (não sonde de novo). */
export function useConnectivity(
  services: readonly Service[],
  options: ConnectivityOptions = {},
): Connectivity {
  const interval = atLeast(options.intervalMs ?? 30_000, 1000, 30_000);
  const threshold = atLeast(options.threshold ?? 2, 1, 2);
  const base = atLeast(options.baseDelayMs ?? 2000, 100, 2000);
  const max = atLeast(options.maxDelayMs ?? 60_000, base, 60_000);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [down, setDown] = useState<readonly string[]>([]);
  const [up, setUp] = useState<readonly string[]>([]);
  const check = useRef(options.check ?? checkHealth);
  useLayoutEffect(() => {
    check.current = options.check ?? checkHealth;
  });
  const key = JSON.stringify(services); // por valor: lista nova a cada render não reinicia nada

  useEffect(() => {
    const stop = new AbortController();
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const failures = new Map<string, number>();
    const busy = new Set<string>();
    async function probe({ name, url }: Service) {
      busy.add(name);
      // `check` que lança antes de devolver a promessa também é falha (e não prende o serviço em `busy`).
      const run = new Promise<boolean>((done) => done(check.current(url, stop.signal)));
      const ok = await run.catch(() => false);
      busy.delete(name);
      if (stop.signal.aborted) return;
      const failed = ok ? 0 : (failures.get(name) ?? 0) + 1;
      failures.set(name, failed);
      setDown((names) => toggle(names, name, failed >= threshold));
      setUp((names) => toggle(names, name, ok));
      const next = ok ? interval : backoffDelay(failed - 1, base, max);
      timers.set(
        name,
        setTimeout(() => probe({ name, url }), next),
      );
    }
    const recheck = () => {
      for (const service of JSON.parse(key) as Service[]) {
        if (busy.has(service.name)) continue; // a checagem em curso já agenda a próxima
        clearTimeout(timers.get(service.name));
        void probe(service);
      }
    };
    const onOnline = () => {
      setOnline(true);
      recheck();
    };
    const onOffline = () => setOnline(false);
    // A lista mudou: quem saiu dela não fica.
    for (const reset of [setDown, setUp]) reset((names) => (names.length ? [] : names));
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    recheck();
    return () => {
      stop.abort();
      for (const timer of timers.values()) clearTimeout(timer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [key, interval, threshold, base, max]);

  return { online, down, up };
}

export type OfflineBannerProps = ConnectivityOptions & { services: readonly Service[] };

/** Faixa de aviso quando a rede cai ou um serviço para de responder; avisa quando volta. */
export function OfflineBanner({ services, ...options }: OfflineBannerProps) {
  return <ConnectivityNotice {...useConnectivity(services, options)} />;
}

/** A faixa a partir de uma `useConnectivity` que o host já tem (ex.: a mesma do `ServiceStatus`). */
export function ConnectivityNotice({ online, down }: Pick<Connectivity, "online" | "down">) {
  const what = down.length > 1 ? "Serviços indisponíveis" : "Serviço indisponível";
  const unavailable = down.length ? `${what}: ${list.format(down)}. Tentando de novo…` : "";
  const problem = online ? unavailable : OFFLINE;
  const [recovered, setRecovered] = useState(false);
  const hadProblem = useRef(false);
  useEffect(() => {
    if (problem) hadProblem.current = true;
    setRecovered(!problem && hadProblem.current);
    if (problem || !hadProblem.current) return;
    hadProblem.current = false;
    const timer = setTimeout(() => setRecovered(false), RECOVERED_MS);
    return () => clearTimeout(timer);
  }, [problem]);
  const message = problem || (recovered ? "Conexão restabelecida." : "");
  const tone = problem
    ? "bg-warning text-warning-foreground"
    : "bg-success text-success-foreground";
  // A região fica sempre montada (vazia, sem altura): o leitor de tela só anuncia o que muda nela.
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(message && ["flex items-center gap-2 px-gutter py-2 text-sm", tone])}
    >
      {message && <Icon name={problem ? "warning" : "success"} className="shrink-0" />}
      {message}
    </div>
  );
}
