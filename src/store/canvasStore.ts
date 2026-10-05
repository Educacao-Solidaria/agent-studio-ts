import type { StudioEdge, StudioNode } from '../types/domain.ts';

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface CanvasSnapshot {
  nodes: StudioNode[];
  edges: StudioEdge[];
}

export interface CanvasStoreState {
  nodes: StudioNode[];
  edges: StudioEdge[];
  selectedNodeId: string | null;
  viewport: Viewport;
  history: CanvasSnapshot[];
}

export interface CanvasStoreActions {
  addNode: (node: StudioNode) => void;
  removeNode: (nodeId: string) => void;
  updateNodeData: <T = Record<string, unknown>>(nodeId: string, data: Partial<T>) => void;
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
  selectNode: (nodeId: string | null) => void;
  addEdge: (edge: StudioEdge) => void;
  removeEdge: (edgeId: string) => void;
  setViewport: (viewport: Partial<Viewport>) => void;
  undo: () => boolean;
  clearCanvas: () => void;
}

export type CanvasStore = CanvasStoreState & CanvasStoreActions;

export type Listener = (state: CanvasStoreState) => void;

/**
 * Cria uma instância isolada da store global do Canvas visual.
 * Implementa padrão pub/sub compatível com Zustand.
 */
export function createCanvasStore(initialState?: Partial<CanvasStoreState>) {
  let state: CanvasStoreState = {
    nodes: initialState?.nodes ? [...initialState.nodes] : [],
    edges: initialState?.edges ? [...initialState.edges] : [],
    selectedNodeId: initialState?.selectedNodeId ?? null,
    viewport: initialState?.viewport ?? { x: 0, y: 0, zoom: 1 },
    history: initialState?.history ? [...initialState.history] : [],
  };

  const listeners = new Set<Listener>();

  function notify(): void {
    for (const listener of listeners) {
      listener(state);
    }
  }

  function pushHistory(): void {
    const snapshot: CanvasSnapshot = {
      nodes: state.nodes.map((n) => ({ ...n, position: { ...n.position }, data: { ...n.data } })),
      edges: state.edges.map((e) => ({ ...e })),
    };
    // Mantém no máximo 20 níveis de histórico para evitar sobrecarga de memória
    state = {
      ...state,
      history: [...state.history.slice(-19), snapshot],
    };
  }

  const actions: CanvasStoreActions = {
    addNode(node: StudioNode): void {
      pushHistory();
      state = {
        ...state,
        nodes: [...state.nodes, { ...node }],
      };
      notify();
    },

    removeNode(nodeId: string): void {
      pushHistory();
      state = {
        ...state,
        nodes: state.nodes.filter((n) => n.id !== nodeId),
        edges: state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
        selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
      };
      notify();
    },

    updateNodeData<T = Record<string, unknown>>(nodeId: string, data: Partial<T>): void {
      pushHistory();
      state = {
        ...state,
        nodes: state.nodes.map((n) => {
          if (n.id !== nodeId) return n;
          return {
            ...n,
            data: { ...n.data, ...data },
          };
        }),
      };
      notify();
    },

    updateNodePosition(nodeId: string, position: { x: number; y: number }): void {
      state = {
        ...state,
        nodes: state.nodes.map((n) => {
          if (n.id !== nodeId) return n;
          return { ...n, position: { ...position } };
        }),
      };
      notify();
    },

    selectNode(nodeId: string | null): void {
      state = {
        ...state,
        selectedNodeId: nodeId,
      };
      notify();
    },

    addEdge(edge: StudioEdge): void {
      if (edge.source === edge.target) {
        throw new Error(`Auto-conexão não permitida no nó: ${edge.source}`);
      }
      const duplicate = state.edges.some(
        (e) => e.id === edge.id || (e.source === edge.source && e.target === edge.target)
      );
      if (duplicate) return;

      pushHistory();
      state = {
        ...state,
        edges: [...state.edges, { ...edge }],
      };
      notify();
    },

    removeEdge(edgeId: string): void {
      pushHistory();
      state = {
        ...state,
        edges: state.edges.filter((e) => e.id !== edgeId),
      };
      notify();
    },

    setViewport(viewport: Partial<Viewport>): void {
      state = {
        ...state,
        viewport: { ...state.viewport, ...viewport },
      };
      notify();
    },

    undo(): boolean {
      if (state.history.length === 0) return false;
      const prevHistory = [...state.history];
      const lastSnapshot = prevHistory.pop()!;
      state = {
        ...state,
        nodes: lastSnapshot.nodes,
        edges: lastSnapshot.edges,
        history: prevHistory,
      };
      notify();
      return true;
    },

    clearCanvas(): void {
      pushHistory();
      state = {
        ...state,
        nodes: [],
        edges: [],
        selectedNodeId: null,
      };
      notify();
    },
  };

  return {
    getState(): CanvasStoreState {
      return state;
    },
    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    ...actions,
  };
}
