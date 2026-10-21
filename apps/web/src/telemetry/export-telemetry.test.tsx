import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ExportTelemetry } from "./export-telemetry.tsx";
import type { PerfSample } from "./perf-samples.ts";

const samples: PerfSample[] = [{ at: 0, model: "m", ttftMs: 100, estimated: false }];
const group = () =>
  screen.getByRole("group", { name: "Exportar relatório de desempenho" }) as HTMLFieldSetElement;

it("sem amostras fica desabilitado; o serializador só carrega no clique, um por formato", async () => {
  const saveTelemetry = vi.fn();
  const load = vi.fn(async () => ({ saveTelemetry }) as never);
  const { rerender } = render(<ExportTelemetry samples={[]} load={load} />);
  expect(group().disabled).toBe(true);
  rerender(<ExportTelemetry samples={samples} load={load} />);
  expect([group().disabled, load.mock.calls.length]).toEqual([false, 0]);
  await userEvent.click(screen.getByRole("button", { name: "CSV" }));
  await userEvent.click(screen.getByRole("button", { name: "JSON" }));
  expect(saveTelemetry.mock.calls.map(([list, format]) => [list, format])).toEqual([
    [samples, "csv"],
    [samples, "json"],
  ]);
});

it("se o serializador não carrega, avisa; o clique seguinte tenta de novo e limpa o aviso", async () => {
  const load = vi.fn().mockRejectedValueOnce(new Error("rede"));
  load.mockResolvedValue({ saveTelemetry: vi.fn() });
  render(<ExportTelemetry samples={samples} load={load} />);
  await userEvent.click(screen.getByRole("button", { name: "CSV" }));
  expect(screen.getByRole("alert").textContent).toBe(
    "Não foi possível exportar. Tente de novo; se o erro persistir, recarregue a página.",
  );
  await userEvent.click(screen.getByRole("button", { name: "CSV" }));
  expect(screen.queryByRole("alert")).toBeNull();
});
