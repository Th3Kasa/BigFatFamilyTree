import { describe, expect, test } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useNoPageZoom } from "./use-no-page-zoom";

function Tree() {
  useNoPageZoom();
  return <div>tree</div>;
}

describe("useNoPageZoom", () => {
  test("stops page pinch-zoom while the tree is shown, and gives it back afterwards", () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<Tree />));
    expect(document.documentElement.style.touchAction).toBe("pan-x pan-y");
    act(() => root.unmount());
    expect(document.documentElement.style.touchAction).toBe("");
    host.remove();
  });
});
