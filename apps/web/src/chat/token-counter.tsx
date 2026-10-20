import { type ReactNode, useEffect, useState } from "react";
import type { StreamMetadataPayload } from "../../../../src/types/sse.ts";
import type { TokenMetrics } from "../../../../src/types/telemetry.ts";
import { cn } from "../lib/cn.ts";
import { EMPTY, formatCurrency, formatNumber, formatTokens } from "../lib/format.ts";
import { loadPricing, type ModelPricing, type PricingTable } from "./model-pricing.ts";

/** Uso real que o gateway manda no evento `metadata` do stream. */
export type StreamUsage = Pick<
  StreamMetadataPayload,
  "prompt_tokens" | "completion_tokens" | "cached"
>;

/** ponytail: ~4 caracteres por token, a média dos tokenizadores BPE em texto; o número exato só
 * vem do gateway (`metadata`). Um tokenizador no navegador custaria megabytes por modelo. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

export type Consumption = TokenMetrics & {
  /** Sem o uso real do gateway ainda (ou só o da entrada): contado pelo texto. */
  estimated: boolean;
  /** Em dólar; indefinido sem preço conhecido. Resposta do cache semântico não chega a cobrar. */
  costUsd?: number;
  /** Fração da janela de contexto do modelo (0–1, passa de 1 se estourar). */
  contextRatio?: number;
};

export function consumption(input: {
  usage?: StreamUsage;
  prompt?: string;
  completion?: string;
  pricing?: ModelPricing;
}): Consumption {
  const { usage, pricing } = input;
  // O contrato deixa o `metadata` vir no começo do stream: com a saída ainda em 0 e texto
  // chegando, ela segue estimada (e tudo com "≈"); a entrada já é a real.
  const counted = usage && (usage.completion_tokens > 0 || !input.completion);
  const promptTokens = usage ? usage.prompt_tokens : estimateTokens(input.prompt ?? "");
  const completionTokens = counted
    ? usage.completion_tokens
    : estimateTokens(input.completion ?? "");
  const totalTokens = promptTokens + completionTokens;
  const priced = pricing && promptTokens * pricing.prompt + completionTokens * pricing.completion;
  return {
    promptTokens,
    completionTokens,
    totalTokens,
    estimated: !counted,
    costUsd: usage?.cached ? 0 : priced,
    contextRatio: pricing?.contextLength ? totalTokens / pricing.contextLength : undefined,
  };
}

export type TokenCounterProps = {
  model: string;
  /** O `metadata` do stream; até ele chegar, os números são estimativa pelo texto. */
  usage?: StreamUsage;
  /** Texto do pedido e da resposta até aqui, para a estimativa. */
  prompt?: string;
  completion?: string;
  /** Preço injetado (ex.: pelo seletor de modelos); sem ele, a tabela da OpenRouter. */
  pricing?: ModelPricing;
  load?: () => Promise<PricingTable>;
  className?: string;
};

/**
 * Consumo da resposta em tempo real: tokens de entrada e saída, custo em dólar e quanto da janela
 * de contexto foi usado. Enquanto o gateway não manda o uso real, tudo sai com "≈" e o rótulo
 * "estimativa". Sem preço conhecido (modelo fora da tabela, tabela fora do ar), o custo fica "—".
 */
export function TokenCounter({
  model,
  pricing,
  load = loadPricing,
  className,
  ...text
}: TokenCounterProps) {
  const [table, setTable] = useState<PricingTable>();
  useEffect(() => {
    // A tabela vale para qualquer modelo: chegar depois de trocar o preço ou desmontar não erra.
    if (!pricing) load().then(setTable, () => undefined); // sem tabela, custo desconhecido
  }, [pricing, load]);
  const now = consumption({ ...text, pricing: pricing ?? table?.get(model) });
  const approx = now.estimated ? "≈ " : "";
  const cost = now.costUsd === undefined ? EMPTY : `${approx}${formatCurrency(now.costUsd)}`;
  const ratio = now.contextRatio;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs", className)}>
      <dl className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Item label="Entrada">{`${approx}${formatTokens(now.promptTokens)}`}</Item>
        <Item label="Saída">{`${approx}${formatTokens(now.completionTokens)}`}</Item>
        <Item label="Custo">{text.usage?.cached ? `${cost} (cache)` : cost}</Item>
        {ratio !== undefined && (
          <Item label="Contexto">
            {/* Menos é melhor: verde até a metade, amarelo até 80%, vermelho perto de estourar. */}
            <meter
              className="h-1.5 w-16"
              min={0}
              max={1}
              low={0.5}
              high={0.8}
              optimum={0}
              value={ratio}
              aria-label="Janela de contexto usada"
            />
            {formatNumber(ratio, { style: "percent", maximumFractionDigits: 1 })}
          </Item>
        )}
      </dl>
      {now.estimated && (
        <span className="rounded-sm bg-muted px-1.5 text-muted-foreground">estimativa</span>
      )}
    </div>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-1.5 font-medium tabular-nums">{children}</dd>
    </div>
  );
}
