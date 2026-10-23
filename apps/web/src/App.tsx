import { sampleEdges, sampleNodes } from "./canvas/sample-flow.ts";
import { StudioCanvas } from "./canvas/studio-canvas.tsx";

export function App() {
  return (
    <main className="flex h-dvh flex-col">
      <header className="border-b px-gutter py-4">
        <h1 className="font-semibold text-lg">Agent Studio</h1>
        <p className="text-muted-foreground text-sm">Canvas visual de agentes e host MCP.</p>
      </header>
      <StudioCanvas
        className="min-h-0 flex-1"
        initialNodes={sampleNodes}
        initialEdges={sampleEdges}
      />
    </main>
  );
}
