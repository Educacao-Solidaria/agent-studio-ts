# Agent Studio TS

> Control plane, canvas visual de fluxos de agentes de IA e host orquestrador de servidores MCP em TypeScript.

## Visão Geral

O **Agent Studio TS** é o painel de comando e orquestração visual do ecossistema. Ele atua como um Host MCP capaz de se conectar simultaneamente ao `flow-gateway-go`, `semantic-cache-rs` e `brain-router-py`, integrando a suíte de agentes do `kit-mcp` com rastreamento em tempo real de consumo do OpenRouter.

## Como Funciona

```
                               [ Agent Studio TS ]
                   (Canvas Visual • Auditoria • Gestão Multi-Tenant)
                                        │
           ┌────────────────────────────┼────────────────────────────┐
           ▼                            ▼                            ▼
  [ MCP: Flow Gateway ]      [ MCP: Semantic Cache ]      [ MCP: Brain Router ]
       (Go / SSE)                 (Rust / <2ms)               (Python / RAG)
```

1. **Canvas de Agentes:** Interface web interativa para modelar nós conversacionais, guardrails e condições de transição entre agentes autônomos.
2. **Host MCP:** Orquestrador que conecta e executa ferramentas remotas de Go, Rust e Python sem acoplamento de código.
3. **Auditoria de Payloads:** Visualização estruturada de cada turno conversacional (JSONL), tempos de resposta e custo exato em dólares consumido no OpenRouter.
4. **Governança Kit-MCP:** Suporte aos agentes e skills especializados do ecossistema `@luanpdd/kit-mcp`.

## Arquitetura & Módulos

O desenvolvimento é guiado pelo roadmap de **100 PRs** no [Plane da in100tiva (STUDTS)](https://plane.in100tiva.com/in100tiva/):

- **Fase 1:** Fundação, CI/CD e Contratos (PRs 01-20)
- **Fase 2:** Core Engine e Protocolo MCP (PRs 21-50)
- **Fase 3:** Adaptadores, Conectores e Streaming (PRs 51-75)
- **Fase 4:** Observabilidade OTel, Evals e Benchmarks (PRs 76-90)
- **Fase 5:** Release v1.0, Docker e Documentação (PRs 91-100+)

## Regras de Engenharia

- **Tamanho dos PRs:** Mínimo 100 linhas, máximo 500 linhas de código.
- **Commits:** Atômicos seguindo padrão Conventional Commits.
- **Contract-First:** Schemas e interfaces definidos primeiro para trabalho paralelo sem bloqueios mútuos.

## Mantenedores

- **Luan Oliveira** ([@in100tiva](https://github.com/in100tiva)) — Arquiteto de Software & Tech Lead
- **Victor Nascimento** ([@VictorNascimento14](https://github.com/VictorNascimento14)) — Tech Lead & Engenheiro de Software
