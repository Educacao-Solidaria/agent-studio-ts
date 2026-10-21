import { useState } from "react";
import { Icon } from "./icons.tsx";
import { Button } from "./ui/button.tsx";

export type ExportButtonsProps<F extends string> = {
  /** Nome do grupo para o leitor de tela. */
  label: string;
  /** Formato → texto do botão, na ordem em que aparecem; o tipo exige um botão por formato. */
  formats: Readonly<Record<F, string>>;
  disabled: boolean;
  /** Gera e baixa o arquivo; quem chama traz o serializador por `import()` aqui, no clique. */
  save: (format: F) => Promise<void>;
};

/** Um botão por formato. Falha (pedaço que não baixou, navegador sem download) vira aviso; o
 * clique seguinte tenta de novo e, dando certo, limpa o aviso. O aviso manda recarregar se
 * persistir: o Chromium guarda o `import()` que falhou na rede e não busca o pedaço de novo no
 * mesmo documento, nem com a rede de volta (medido no 148). */
export function ExportButtons<F extends string>(props: ExportButtonsProps<F>) {
  const { label, formats, disabled, save } = props;
  const [failed, setFailed] = useState(false);
  const run = async (format: F) => {
    try {
      await save(format);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  };
  return (
    <fieldset aria-label={label} disabled={disabled} className="flex gap-2">
      {(Object.keys(formats) as F[]).map((format) => (
        <Button key={format} variant="secondary" size="sm" onClick={() => run(format)}>
          <Icon name="download" />
          {formats[format]}
        </Button>
      ))}
      {failed && (
        <p role="alert" className="self-center text-danger text-sm">
          Não foi possível exportar. Tente de novo; se o erro persistir, recarregue a página.
        </p>
      )}
    </fieldset>
  );
}
