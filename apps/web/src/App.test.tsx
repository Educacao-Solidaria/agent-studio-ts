import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./App.tsx";

describe("App", () => {
  it("renderiza o título do estúdio", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain(">Agent Studio</h1>");
  });
});
