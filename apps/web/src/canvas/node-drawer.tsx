import { type ChangeEvent, type FormEvent, useEffect, useId, useRef, useState } from "react";
import { Icon } from "../components/icons.tsx";
import { Badge } from "../components/ui/badge.tsx";
import { Button } from "../components/ui/button.tsx";
import { fieldClass } from "../components/ui/field.ts";
import { Input } from "../components/ui/input.tsx";
import { Textarea } from "../components/ui/textarea.tsx";
import { cn } from "../lib/cn.ts";
import { NODE_LABELS, type StudioFlowNode } from "./flow.ts";
import { type Draft, type Field, formFor, fromDraft, toDraft } from "./node-forms.ts";

type FieldInputProps = {
  field: Field;
  value: Draft[string] | undefined;
  onChange: (value: Draft[string]) => void;
};

/** Caixa de marcar com rótulo; render function (não componente) para servir às duas formas. */
const check = (label: string, checked: boolean, set: (on: boolean) => void, required = false) => (
  <label key={label} className="flex items-center gap-2 text-sm">
    <input type="checkbox" {...{ checked, required }} onChange={(e) => set(e.target.checked)} />
    {label}
  </label>
);

function FieldInput({ field, value, onChange }: FieldInputProps) {
  const id = useId();
  if (field.kind === "checkbox") return check(field.label, value === true, onChange);
  if (field.kind === "options") {
    const chosen = Array.isArray(value) ? value : [];
    // "Ao menos uma": enquanto nenhuma está marcada, todas são `required`.
    const required = field.required === true && chosen.length === 0;
    const toggle = (option: string) => (on: boolean) =>
      onChange(on ? [...chosen, option] : chosen.filter((item) => item !== option));
    return (
      <fieldset className="grid gap-1">
        <legend className="mb-1 text-sm">{field.label}</legend>
        {Object.entries(field.options).map(([v, text]) =>
          check(text, chosen.includes(v), toggle(v), required),
        )}
      </fieldset>
    );
  }
  const props = {
    id,
    required: field.required,
    value: typeof value === "string" ? value : "",
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onChange(e.target.value),
  };
  let control = <Input {...props} />;
  if (field.kind === "textarea") control = <Textarea {...props} />;
  if (field.kind === "number") {
    control = (
      <Input {...props} type="number" min={field.min} max={field.max} step={field.step ?? "any"} />
    );
  }
  if (field.kind === "select") {
    const options = Object.entries({ "": "Padrão", ...field.options });
    control = (
      <select {...props} className={cn(fieldClass, "h-10")}>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    );
  }
  return (
    <div className="grid gap-1 text-sm">
      <label htmlFor={id}>{field.label}</label>
      {control}
    </div>
  );
}

export type NodeDrawerProps = {
  /** O nó selecionado; sem ele o painel some (e os rascunhos ficam guardados). */
  node?: StudioFlowNode;
  onSave: (id: string, config: Record<string, unknown>) => void;
  onClose: (id: string) => void;
};

/** Comparação do memo do painel: ele só lê id, tipo e config do nó; posição e medida não contam. */
export const sameDrawerProps = (a: NodeDrawerProps, b: NodeDrawerProps) =>
  a.onSave === b.onSave &&
  a.onClose === b.onClose &&
  a.node?.id === b.node?.id &&
  a.node?.type === b.node?.type &&
  a.node?.data.config === b.node?.data.config;

/**
 * Painel lateral de propriedades do nó selecionado, com o formulário do tipo dele.
 * Rascunho por nó: trocar de nó, fechar o painel ou clicar no fundo não perde o que foi
 * digitado — volta ao reabrir o nó, com o aviso "Alterações não salvas", até Salvar (valida
 * e grava na config) ou Descartar. Ao abrir, o foco vai para o título; Esc fecha.
 */
export function NodeDrawer({ node, onSave, onClose }: NodeDrawerProps) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const titleId = useId();
  const title = useRef<HTMLHeadingElement>(null);
  const id = node?.id;
  useEffect(() => {
    if (id !== undefined) title.current?.focus();
  }, [id]);
  if (!node) return null;

  const nodeId = node.id;
  const close = () => onClose(nodeId);
  const fields = formFor(node.type);
  const saved = toDraft(node.data.config, fields);
  const draft = drafts[nodeId] ?? saved;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const change = (key: string) => (value: Draft[string]) =>
    setDrafts((all) => ({ ...all, [nodeId]: { ...(all[nodeId] ?? saved), [key]: value } }));
  const discard = () =>
    setDrafts((all) => Object.fromEntries(Object.entries(all).filter(([key]) => key !== nodeId)));
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    // Por cima da config: chave que o formulário não mostra (de outro PR, por exemplo) fica.
    onSave(nodeId, { ...node.data.config, ...fromDraft(draft, fields) });
    discard();
  };

  return (
    <aside
      aria-labelledby={titleId}
      onKeyDown={(event) => event.key === "Escape" && close()}
      className="flex w-80 shrink-0 animate-fade-in flex-col gap-4 overflow-y-auto border-l bg-surface p-gutter text-surface-foreground"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id={titleId} ref={title} tabIndex={-1} className="font-semibold outline-hidden">
            {NODE_LABELS[node.type]}
          </h2>
          <p className="text-muted-foreground text-xs">{nodeId}</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Fechar" onClick={close} className="nokey">
          <Icon name="close" />
        </Button>
      </div>
      {fields.length === 0 ? (
        <p className="text-muted-foreground text-sm">Sem propriedades editáveis neste tipo.</p>
      ) : (
        // nokey: Delete em botão daqui não apaga o nó; no título (foco ao abrir) segue apagando.
        <form onSubmit={submit} className="nokey grid gap-3">
          {fields.map((f) => (
            <FieldInput key={f.key} field={f} value={draft[f.key]} onChange={change(f.key)} />
          ))}
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={!dirty}>
              Salvar
            </Button>
            <Button variant="secondary" disabled={!dirty} onClick={discard}>
              Descartar
            </Button>
            {dirty && <Badge variant="warning">Alterações não salvas</Badge>}
          </div>
        </form>
      )}
    </aside>
  );
}
