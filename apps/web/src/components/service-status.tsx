import { cn } from "../lib/cn.ts";
import { Icon, type IconName } from "./icons.tsx";
import type { Connectivity, Service } from "./offline-banner.tsx";

export type ServiceHealth = "up" | "down" | "checking" | "offline";

/** O estado da lâmpada de um serviço, lido da mesma `useConnectivity` da faixa de aviso. */
export function serviceHealth(name: string, { online, down, up }: Connectivity): ServiceHealth {
  // Sem rede no navegador, o servidor pode estar de pé: não dá para saber.
  if (!online) return "offline";
  if (down.includes(name)) return "down";
  return up.includes(name) ? "up" : "checking"; // sem resposta ainda, ou falhou abaixo do limite
}

// Texto e ícone dizem o estado; a cor fica só no ícone (a lâmpada), onde 3:1 basta.
const LAMPS: Record<ServiceHealth, { text: string; icon: IconName; tone: string }> = {
  up: { text: "Disponível", icon: "success", tone: "text-success" },
  down: { text: "Indisponível", icon: "error", tone: "text-danger" },
  checking: { text: "Verificando…", icon: "loading", tone: "motion-safe:animate-spin" },
  offline: { text: "Sem rede", icon: "warning", tone: "text-muted-foreground" },
};

export type ServiceStatusProps = { services: readonly Service[]; connectivity: Connectivity };

/**
 * Uma lâmpada por serviço do backend (gateway em Go, cache em Rust, RAG em Python). Não sonda
 * nada: o host chama `useConnectivity(services)` uma vez e passa o resultado a esta lista e à
 * `ConnectivityNotice`. Premissa: as URLs de saúde são da mesma origem do estúdio (servido atrás
 * do gateway ou de um proxy) — o `/healthz` do gateway não tem CORS, e o `/health` do cache só
 * atende no loopback.
 */
export function ServiceStatus({ services, connectivity }: ServiceStatusProps) {
  return (
    <ul aria-label="Saúde dos serviços" className="grid gap-1.5 text-sm">
      {services.map(({ name }) => {
        const lamp = LAMPS[serviceHealth(name, connectivity)];
        return (
          <li key={name} className="flex items-center gap-2">
            <Icon name={lamp.icon} className={cn("shrink-0", lamp.tone)} />
            <span>{name}</span>
            <span className="ml-auto font-medium">{lamp.text}</span>
          </li>
        );
      })}
    </ul>
  );
}
