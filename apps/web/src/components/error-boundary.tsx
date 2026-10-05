import { Component, type ReactNode, useEffect, useId, useRef } from "react";
import { Icon } from "./icons.tsx";
import { Button } from "./ui/button.tsx";

type ErrorBoundaryProps = {
  children: ReactNode;
  /** Chamado antes de remontar a subárvore: limpe aqui o estado que causou o erro. */
  onReset?: () => void;
  /** Mostra mensagem e stack do erro. Padrão: só em desenvolvimento. */
  showDetails?: boolean;
};

type ErrorBoundaryState = { failed: boolean; error: unknown };

/**
 * Captura erros de render da subárvore e mostra a tela de recuperação.
 * "Tentar novamente" só remonta os filhos: o estado fora do boundary e a página continuam.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false, error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { failed: true, error };
  }

  reset = () => {
    this.props.onReset?.();
    this.setState({ failed: false, error: null });
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <ErrorFallback
        error={this.state.error}
        showDetails={this.props.showDetails ?? import.meta.env.DEV}
        onRetry={this.reset}
      />
    );
  }
}

type ErrorFallbackProps = { error: unknown; showDetails: boolean; onRetry: () => void };

function ErrorFallback({ error, showDetails, onRetry }: ErrorFallbackProps) {
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Leva o foco ao título para leitor de tela e teclado não ficarem num nó que sumiu.
  useEffect(() => headingRef.current?.focus(), []);

  return (
    <section
      role="alert"
      aria-labelledby={titleId}
      className="mx-auto flex max-w-lg flex-col items-start gap-4 p-panel"
    >
      <Icon name="error" size={32} className="text-danger" />
      <h2
        id={titleId}
        ref={headingRef}
        tabIndex={-1}
        className="font-semibold text-xl outline-hidden"
      >
        Algo deu errado nesta tela
      </h2>
      <p className="text-muted-foreground">
        O restante do estúdio continua funcionando. Tente de novo; se o erro persistir, recarregue a
        página.
      </p>
      {showDetails && (
        <pre className="max-h-64 w-full overflow-auto rounded-md bg-muted p-3 text-xs">
          {error instanceof Error ? (error.stack ?? error.message) : String(error)}
        </pre>
      )}
      <Button onClick={onRetry}>Tentar novamente</Button>
    </section>
  );
}
