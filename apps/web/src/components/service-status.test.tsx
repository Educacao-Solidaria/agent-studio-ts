import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConnectivityNotice, type Service, useConnectivity } from "./offline-banner.tsx";
import { ServiceStatus, serviceHealth } from "./service-status.tsx";

const GO: Service = { name: "Gateway (Go)", url: "/healthz" };
const RUST: Service = { name: "Cache (Rust)", url: "/cache/health" };
const PY: Service = { name: "RAG (Python)", url: "/rag/healthz" };
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
/** Cada lâmpada como "nome + estado | ícone" (o nome do ícone vem da classe do lucide). */
const lamps = () =>
  [...screen.getByRole("list", { name: "Saúde dos serviços" }).querySelectorAll("li")].map(
    (li) => `${li.textContent}|${li.querySelector("svg")?.classList[1]?.replace("lucide-", "")}`,
  );

/** O host: UMA `useConnectivity` para a faixa e para as lâmpadas. */
function Host(props: { services: Service[]; check: (url: string) => Promise<boolean> }) {
  const connectivity = useConnectivity(props.services, { check: props.check });
  return (
    <>
      <ConnectivityNotice {...connectivity} />
      <ServiceStatus services={props.services} connectivity={connectivity} />
    </>
  );
}

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, "onLine");
});

it("uma sondagem só para a faixa e as lâmpadas; cada estado com texto e ícone próprios", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.spyOn(Math, "random").mockReturnValue(1); // jitter no teto: esperas exatas
  const health: Record<string, boolean> = { [RUST.url]: false };
  const calls: string[] = [];
  const check = async (url: string) => {
    calls.push(url);
    return health[url] ?? true;
  };
  render(<Host services={[GO, RUST, PY]} check={check} />);
  const checking = (s: Service) => `${s.name}Verificando…|loader-circle`;
  expect(lamps()).toEqual([GO, RUST, PY].map(checking)); // nada é dado como de pé antes de responder
  await advance(0);
  expect(calls).toEqual([GO.url, RUST.url, PY.url]); // uma checagem por serviço, não uma por tela
  const up = (s: Service) => `${s.name}Disponível|circle-check`;
  expect(lamps()).toEqual([up(GO), checking(RUST), up(PY)]); // 1ª falha: tentando de novo
  await advance(2000);
  expect(lamps()[1]).toBe("Cache (Rust)Indisponível|circle-x");
  const tone = (i: number) => screen.getAllByRole("listitem")[i]?.querySelector("svg")?.classList;
  expect([tone(0)?.contains("text-success"), tone(1)?.contains("text-danger")]).toEqual([
    true,
    true,
  ]);
  expect(screen.getByRole("status").textContent).toBe(
    "Serviço indisponível: Cache (Rust). Tentando de novo…",
  );
  health[RUST.url] = true;
  await advance(4000);
  expect(lamps()[1]).toBe(up(RUST));
});

it("sem rede no navegador: 'Sem rede' em todas, mesmo com resposta boa", async () => {
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
  render(<Host services={[GO, PY]} check={async () => true} />);
  await act(async () => {});
  expect(lamps()).toEqual([
    `${GO.name}Sem rede|triangle-alert`,
    `${PY.name}Sem rede|triangle-alert`,
  ]);
});

it("lista nova recomeça: quem volta não herda a lâmpada da lista anterior", async () => {
  const check = async () => true;
  const { rerender } = render(<Host services={[GO]} check={check} />);
  await act(async () => {});
  expect(lamps()).toEqual([`${GO.name}Disponível|circle-check`]);
  rerender(<Host services={[PY, GO]} check={() => new Promise<boolean>(() => {})} />);
  expect(lamps()).toEqual([
    `${PY.name}Verificando…|loader-circle`,
    `${GO.name}Verificando…|loader-circle`,
  ]);
});

it("ordem de precedência: sem rede > fora > de pé > verificando", () => {
  const connectivity = { online: true, down: ["a"], up: ["a", "b"] };
  expect(["a", "b", "c"].map((name) => serviceHealth(name, connectivity))).toEqual([
    "down",
    "up",
    "checking",
  ]);
  expect(serviceHealth("b", { ...connectivity, online: false })).toBe("offline");
});
