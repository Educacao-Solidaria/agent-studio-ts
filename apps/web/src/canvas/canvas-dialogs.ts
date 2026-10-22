/**
 * Pedaço sob demanda dos diálogos do canvas: a paleta de nós, os modelos de fluxo e o Dialog do
 * Radix que os dois usam (fora do JS principal). Um pedaço só, de propósito: com dois, o Dialog
 * viraria um terceiro, compartilhado, e uma falha de rede nele só se resolve recarregando a página
 * (ver lib/retry-import.ts). Quem baixa: `loadCanvasDialogs`, em lazy-dialogs.tsx.
 */
export { NodePalette } from "./node-palette.tsx";
export { TemplateDialog } from "./template-dialog.tsx";
