import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { TimelinePost, TimelineViewer } from "@/lib/timeline/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
const setHeart = vi.fn(async () => ({ success: true }));
vi.mock("@/lib/actions/timeline", () => ({
  addComment: vi.fn(),
  createPost: vi.fn(),
  deleteComment: vi.fn(),
  deletePost: vi.fn(),
  discardUploads: vi.fn(),
  removeTag: vi.fn(),
  setHeart,
  startPhotoUploads: vi.fn(),
  updatePost: vi.fn(),
}));

const { Timeline } = await import("./Timeline");

const people = [
  { id: "nassif", slug: "nassif", name: "Nassif Mansour", given_en: "Nassif", given_ar: null, family_name_en: "Mansour", family_name_ar: null },
  { id: "victoria", slug: "victoria", name: "Victoria Mansour", given_en: "Victoria", given_ar: null, family_name_en: "Mansour", family_name_ar: null },
];
const post: TimelinePost = {
  id: "p1", personId: "nassif", authorId: "galila", authorName: "Galila Mansour", title: null, body: "The whole family at Stanley Bay.",
  dateValue: "1975-01-01", datePrecision: "around", location: "Alexandria", video: null, createdAt: new Date().toISOString(), edited: false,
  media: [{ id: "m1", width: 1600, height: 1200 }], tagIds: ["victoria"], hearts: 2, hearted: false,
  comments: [{ id: "c1", authorId: "sam", authorName: "Samuel Mansour", body: "I remember this!", createdAt: new Date().toISOString() }],
};
const me = (o: Partial<TimelineViewer> = {}): TimelineViewer => ({ userId: "me", name: "Basem", isAdmin: false, ownsProfile: false, personId: null, ...o });

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

const props = {
  personId: "nassif",
  firstName: "Nassif",
  events: [{ id: "e1", dateValue: "1946-01-01", node: <p>Married Victoria</p> }],
  people,
  photosEnabled: true,
  available: true,
  lang: "en" as const,
  emptyState: <p>Empty</p>,
};

describe("Timeline", () => {
  test("shows the composer, posts with photos, tags and comments, and life events under decades", () => {
    act(() => root.render(<Timeline {...props} posts={[post]} viewer={me()} />));
    const text = host.textContent ?? "";
    expect(text).toContain("Galila Mansour");
    expect(text).toContain("added a photo");
    expect(text).toContain("Around 1975 · Alexandria");
    expect(text).toContain("Victoria Mansour");
    expect(text).toContain("I remember this!");
    expect(text).toContain("1970s");
    expect(text).toContain("1940s");
    expect(text).toContain("Married Victoria");
    expect(host.querySelector('textarea[placeholder="Share a memory of Nassif…"]')).not.toBeNull();
    expect(host.querySelector('img[src="/api/media/m1/display"]')).not.toBeNull();
    expect(host.querySelector('a[href="/api/media/m1/original"]')).not.toBeNull();
  });

  test("only shows the post menu to people who may edit or delete", () => {
    act(() => root.render(<Timeline {...props} posts={[post]} viewer={me()} />));
    expect(host.querySelector('button[aria-label="Post options"]')).toBeNull();
    act(() => root.render(<Timeline {...props} posts={[post]} viewer={me({ ownsProfile: true })} />));
    expect(host.querySelector('button[aria-label="Post options"]')).not.toBeNull();
  });

  test("hearts update straight away and are saved", async () => {
    act(() => root.render(<Timeline {...props} posts={[post]} viewer={me()} />));
    const heart = host.querySelector<HTMLButtonElement>('button[aria-pressed="false"]')!;
    await act(async () => heart.click());
    expect(heart.getAttribute("aria-pressed")).toBe("true");
    expect(heart.textContent).toContain("3");
    expect(setHeart).toHaveBeenCalledWith("p1", true);
  });

  test("signed-out or unapproved viewers get no composer, and the empty state when there's nothing", () => {
    act(() => root.render(<Timeline {...props} events={[]} posts={[]} viewer={null} />));
    expect(host.querySelector("textarea")).toBeNull();
    expect(host.textContent).toContain("Empty");
  });
});
