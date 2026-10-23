import type { Service } from "./offline-banner.tsx";

/**
 * Os serviços do backend que o painel sonda, na MESMA origem do estúdio: o nginx dele
 * (docker/nginx.conf) leva cada `/health/*` à saúde do serviço pelo nome DNS do compose do
 * ecossistema (contratos da Fase 5, §5). O host chama `useConnectivity(BACKEND_SERVICES)` uma vez
 * e passa o resultado à faixa e às lâmpadas.
 */
export const BACKEND_SERVICES: readonly Service[] = [
  { name: "Gateway (Go)", url: "/health/gateway" },
  { name: "Cache semântico (Rust)", url: "/health/cache" },
  { name: "RAG (Python)", url: "/health/rag" },
];
