import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PartialDateField } from "./partial-date-field";

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

const hidden = () => host.querySelector<HTMLInputElement>('input[type="hidden"]')!.value;
const year = () => host.querySelector<HTMLInputElement>("input[inputmode=numeric]")!;
const [day, month] = [() => host.querySelectorAll("select")[0], () => host.querySelectorAll("select")[1]];

function typeYear(v: string) {
  const el = year();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function pick(el: HTMLSelectElement, v: string) {
  act(() => {
    el.value = v;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("PartialDateField", () => {
  test("year only is enough; month and day refine it", () => {
    const onChange = vi.fn();
    act(() => root.render(<PartialDateField label="Birth date" lang="en" name="birth_date" onChange={onChange} />));
    expect(day().disabled).toBe(true);
    typeYear("1917");
    expect(hidden()).toBe("1917");
    pick(month(), "5");
    expect(hidden()).toBe("1917-05");
    pick(day(), "9");
    expect(hidden()).toBe("1917-05-09");
    expect(onChange).toHaveBeenLastCalledWith("1917-05-09");
    pick(month(), "");
    expect(hidden()).toBe("1917");
  });

  test("opens with a stored month-and-year date filled in", () => {
    act(() => root.render(<PartialDateField label="Death date" lang="en" name="death_date" defaultValue="1991-03" />));
    expect(year().value).toBe("1991");
    expect(month().value).toBe("3");
    expect(day().value).toBe("");
    expect(hidden()).toBe("1991-03");
  });

  test("a short year asks for 4 digits and saves nothing", () => {
    act(() => root.render(<PartialDateField label="Birth date" lang="en" name="birth_date" />));
    typeYear("191");
    expect(hidden()).toBe("");
    expect(year().getAttribute("aria-invalid")).toBe("true");
    expect(host.textContent).toContain("4 digits");
  });

  test("an older free-text value is kept until the date is edited", () => {
    act(() => root.render(<PartialDateField label="Birth date" lang="en" name="birth_date" defaultValue="about 1917" />));
    expect(hidden()).toBe("about 1917");
  });
});
