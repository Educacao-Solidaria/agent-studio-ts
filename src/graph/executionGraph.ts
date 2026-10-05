import type { StudioEdge, StudioNode } from '../types/domain.ts';

export interface GraphValidationResult {
  valid: boolean;
  errors: string[];
}

export class ExecutionGraph {
  private nodes: Map<string, StudioNode>;
  private edges: StudioEdge[];
  private adjacencyList: Map<string, string[]>;
  private inDegree: Map<string, number>;

  constructor(nodes: StudioNode[] = [], edges: StudioEdge[] = []) {
    this.nodes = new Map();
    this.edges = [...edges];
    this.adjacencyList = new Map();
    this.inDegree = new Map();

    for (const node of nodes) {
      this.nodes.set(node.id, node);
      this.adjacencyList.set(node.id, []);
      this.inDegree.set(node.id, 0);
    }

    this.buildAdjacency();
  }

  private buildAdjacency(): void {
    for (const edge of this.edges) {
      if (this.nodes.has(edge.source) && this.nodes.has(edge.target)) {
        this.adjacencyList.get(edge.source)?.push(edge.target);
        const currentIn = this.inDegree.get(edge.target) || 0;
        this.inDegree.set(edge.target, currentIn + 1);
      }
    }
  }

  public validate(): GraphValidationResult {
    const errors: string[] = [];

    // Checar arestas com nós inexistentes
    for (const edge of this.edges) {
      if (!this.nodes.has(edge.source)) {
        errors.push(`Aresta ${edge.id} aponta para origem inexistente: ${edge.source}`);
      }
      if (!this.nodes.has(edge.target)) {
        errors.push(`Aresta ${edge.id} aponta para destino inexistente: ${edge.target}`);
      }
    }

    // Detecção de ciclos via ordenação topológica (Kahn)
    if (this.detectCycle()) {
      errors.push('O grafo de execucao contem ciclos direcionados (deve ser um DAG)');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  public detectCycle(): boolean {
    const tempInDegree = new Map<string, number>(this.inDegree);
    const queue: string[] = [];

    for (const [id, deg] of tempInDegree.entries()) {
      if (deg === 0) {
        queue.push(id);
      }
    }

    let visitedCount = 0;
    while (queue.length > 0) {
      const current = queue.shift()!;
      visitedCount++;

      const neighbors = this.adjacencyList.get(current) || [];
      for (const neighbor of neighbors) {
        const nextDeg = (tempInDegree.get(neighbor) || 0) - 1;
        tempInDegree.set(neighbor, nextDeg);
        if (nextDeg === 0) {
          queue.push(neighbor);
        }
      }
    }

    return visitedCount !== this.nodes.size;
  }

  public getTopologicalOrder(): string[] {
    if (this.detectCycle()) {
      throw new Error('Impossivel calcular ordem topologica: o grafo contem ciclos');
    }

    const tempInDegree = new Map<string, number>(this.inDegree);
    const queue: string[] = [];
    const order: string[] = [];

    for (const [id, deg] of tempInDegree.entries()) {
      if (deg === 0) {
        queue.push(id);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      order.push(current);

      const neighbors = this.adjacencyList.get(current) || [];
      for (const neighbor of neighbors) {
        const nextDeg = (tempInDegree.get(neighbor) || 0) - 1;
        tempInDegree.set(neighbor, nextDeg);
        if (nextDeg === 0) {
          queue.push(neighbor);
        }
      }
    }

    return order;
  }

  public getRootNodes(): StudioNode[] {
    const roots: StudioNode[] = [];
    for (const [id, deg] of this.inDegree.entries()) {
      if (deg === 0) {
        const node = this.nodes.get(id);
        if (node) roots.push(node);
      }
    }
    return roots;
  }
}
