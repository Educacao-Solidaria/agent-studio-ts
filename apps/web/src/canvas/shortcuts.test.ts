import { describe, expect, it } from "vitest";
import { ariaKeys, keyHint, shortcutOf } from "./shortcuts.ts";

const press = (key: string, init: KeyboardEventInit = {}) =>
  shortcutOf(new KeyboardEvent("keydown", { key, code: `Key${key.toUpperCase()}`, ...init }));

describe("shortcutOf", () => {
  it("Ctrl ou Cmd + Z desfaz; Y ou Shift+Z refaz", () => {
    expect(press("z", { ctrlKey: true })).toBe("undo");
    expect(press("z", { metaKey: true })).toBe("undo");
    expect(press("Z", { ctrlKey: true })).toBe("undo"); // Caps Lock
    expect(press("y", { ctrlKey: true })).toBe("redo");
    expect(press("Z", { ctrlKey: true, shiftKey: true })).toBe("redo");
    expect(press("Z", { metaKey: true, shiftKey: true })).toBe("redo");
  });

  it("Ctrl/Cmd+D duplica e Ctrl/Cmd+A seleciona tudo", () => {
    expect(press("d", { ctrlKey: true })).toBe("duplicate");
    expect(press("a", { metaKey: true })).toBe("selectAll");
  });

  it("sem Ctrl/Cmd, com Alt (AltGr) ou em outra tecla não é atalho", () => {
    expect(press("z")).toBeUndefined();
    expect(press("z", { ctrlKey: true, altKey: true })).toBeUndefined();
    expect(press("x", { ctrlKey: true })).toBeUndefined();
    expect(press("Y", { ctrlKey: true, shiftKey: true })).toBeUndefined();
    // Delete e Espaço são do React Flow: o ouvinte do mapa não os executa.
    expect(
      shortcutOf(new KeyboardEvent("keydown", { key: "Delete", ctrlKey: true })),
    ).toBeUndefined();
  });

  it("em layout não latino vale a tecla física", () => {
    const cyrillic = new KeyboardEvent("keydown", { key: "я", code: "KeyZ", ctrlKey: true });
    expect(shortcutOf(cyrillic)).toBe("undo");
  });
});

describe("dicas", () => {
  it("aria-keyshortcuts lista Control e Meta de cada combinação", () => {
    expect(ariaKeys("undo")).toBe("Control+Z Meta+Z");
    expect(ariaKeys("redo")).toBe("Control+Y Meta+Y Control+Shift+Z Meta+Shift+Z");
    expect(ariaKeys("remove")).toBe("Delete Backspace");
  });

  it("a dica visível mostra a primeira combinação com Ctrl", () => {
    expect(keyHint("undo")).toBe("Ctrl+Z");
    expect(keyHint("redo")).toBe("Ctrl+Y");
    expect(keyHint("pan")).toBe("Espaço");
  });
});
