import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon, type IconName, icons } from "./icons.tsx";

describe("Icon", () => {
  it("renderiza todo ícone do catálogo como svg", () => {
    for (const name of Object.keys(icons) as IconName[]) {
      const { container, unmount } = render(<Icon name={name} />);
      expect(container.querySelector("svg"), name).not.toBeNull();
      unmount();
    }
  });

  it("é decorativo por padrão", () => {
    const { container } = render(<Icon name="agent" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("width")).toBe("16");
  });

  it("com label vira imagem acessível", () => {
    render(<Icon name="error" label="Falhou" className="text-danger" />);
    const img = screen.getByRole("img", { name: "Falhou" });
    expect(img.hasAttribute("aria-hidden")).toBe(false);
    expect(img.getAttribute("class")).toContain("text-danger");
  });
});
