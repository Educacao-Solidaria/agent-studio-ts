import { vi } from "vitest";

/**
 * jsdom não implementa matchMedia, ResizeObserver, IntersectionObserver nem clipboard.
 * O setup reinstala tudo antes de cada teste, então nenhum estado vaza entre testes.
 */
export function installBrowserMocks() {
  mediaQueries.clear();
  observers.clear();
  vi.stubGlobal("matchMedia", matchMedia);
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

  let clipboardText = "";
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: vi.fn(async (text: string) => {
        clipboardText = text;
      }),
      readText: vi.fn(async () => clipboardText),
    },
  });
}

// --- matchMedia: uma MediaQueryList por query, com eventos de change -------------------

const mediaQueries = new Map<string, MediaQueryList>();

function matchMedia(query: string): MediaQueryList {
  let list = mediaQueries.get(query);
  if (!list) {
    const target = new EventTarget();
    list = Object.assign(target, {
      media: query,
      matches: false,
      onchange: null,
      addListener: (cb: EventListener) => target.addEventListener("change", cb),
      removeListener: (cb: EventListener) => target.removeEventListener("change", cb),
    }) as unknown as MediaQueryList;
    mediaQueries.set(query, list);
  }
  return list;
}

/** Muda o resultado de uma media query e avisa quem a escuta (ex.: prefers-color-scheme). */
export function setMediaQuery(query: string, matches: boolean) {
  const list = matchMedia(query);
  Object.assign(list, { matches });
  list.dispatchEvent(Object.assign(new Event("change"), { matches, media: query }));
}

// --- observers: guardam o que observam para o teste disparar o callback ------------------

type AnyObserver = MockResizeObserver | MockIntersectionObserver;
const observers = new Set<AnyObserver>();

class MockObserver<Callback> {
  readonly targets = new Set<Element>();
  constructor(readonly callback: Callback) {
    observers.add(this as unknown as AnyObserver);
  }
  observe = vi.fn((target: Element) => void this.targets.add(target));
  unobserve = vi.fn((target: Element) => void this.targets.delete(target));
  disconnect = vi.fn(() => this.targets.clear());
}

class MockResizeObserver extends MockObserver<ResizeObserverCallback> {}

class MockIntersectionObserver extends MockObserver<IntersectionObserverCallback> {
  readonly root = null;
  readonly rootMargin = "0px";
  readonly thresholds: readonly number[] = [0];
  takeRecords = vi.fn((): IntersectionObserverEntry[] => []);
}

/** Dispara o callback de todo ResizeObserver que observa `target`. */
export function triggerResize(target: Element, size: { width: number; height: number }) {
  const contentRect = DOMRectReadOnly.fromRect(size);
  for (const observer of observers) {
    if (!(observer instanceof MockResizeObserver) || !observer.targets.has(target)) continue;
    const entry = { target, contentRect } as unknown as ResizeObserverEntry;
    observer.callback([entry], observer as unknown as ResizeObserver);
  }
}

/** Dispara o callback de todo IntersectionObserver que observa `target`. */
export function triggerIntersection(target: Element, isIntersecting: boolean) {
  for (const observer of observers) {
    if (!(observer instanceof MockIntersectionObserver) || !observer.targets.has(target)) continue;
    const entry = {
      target,
      isIntersecting,
      intersectionRatio: isIntersecting ? 1 : 0,
    } as unknown as IntersectionObserverEntry;
    observer.callback([entry], observer as unknown as IntersectionObserver);
  }
}
