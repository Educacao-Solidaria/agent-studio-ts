import {
  Bot,
  ChevronDown,
  CircleCheck,
  CircleX,
  Copy,
  DollarSign,
  Ellipsis,
  LoaderCircle,
  type LucideProps,
  Pause,
  Play,
  Plus,
  Search,
  Server,
  Settings,
  Square,
  Trash2,
  TriangleAlert,
  Workflow,
  Wrench,
  X,
} from "lucide-react";

/**
 * Catálogo de ícones do estúdio: o código pede pelo significado ("run"),
 * não pelo desenho ("Play"), e trocar o desenho é mudar uma linha aqui.
 */
export const icons = {
  agent: Bot,
  flow: Workflow,
  tool: Wrench,
  mcpServer: Server,
  cost: DollarSign,
  run: Play,
  pause: Pause,
  stop: Square,
  success: CircleCheck,
  error: CircleX,
  warning: TriangleAlert,
  loading: LoaderCircle,
  add: Plus,
  copy: Copy,
  delete: Trash2,
  search: Search,
  settings: Settings,
  more: Ellipsis,
  expand: ChevronDown,
  close: X,
} as const;

export type IconName = keyof typeof icons;

export type IconProps = Omit<LucideProps, "ref"> & {
  name: IconName;
  /** Com rótulo o ícone é anunciado como imagem; sem ele fica decorativo (aria-hidden). */
  label?: string;
};

export function Icon({ name, label, size = 16, ...props }: IconProps) {
  const Component = icons[name];
  return label ? (
    <Component size={size} role="img" aria-label={label} {...props} />
  ) : (
    <Component size={size} aria-hidden="true" {...props} />
  );
}
