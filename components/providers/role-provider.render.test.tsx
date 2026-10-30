import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RoleProvider, useRole, type EditableScope } from "./role-provider";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function Probe() {
  const { canEdit, isAdmin, canEditPerson } = useRole();
  return <p>{[canEdit, isAdmin, canEditPerson("me"), canEditPerson("cousin"), canEditPerson(null)].map(String).join(",")}</p>;
}

const show = (role: string | undefined, editable?: EditableScope) => {
  act(() => root.render(<RoleProvider role={role} editable={editable}><Probe /></RoleProvider>));
  return host.textContent;
};

describe("useRole().canEditPerson", () => {
  test("admins may edit anyone", () => {
    expect(show("admin", "all")).toBe("true,true,true,true,false");
  });
  test("editors only the people in their close family", () => {
    expect(show("editor", ["me"])).toBe("true,false,true,false,false");
  });
  test("viewers nobody, even if a list slipped through", () => {
    expect(show("viewer", ["me"])).toBe("false,false,false,false,false");
  });
  test("no scope given means nobody (never everyone)", () => {
    expect(show("editor")).toBe("true,false,false,false,false");
  });
});
