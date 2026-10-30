import type { VideoProvider } from "@/lib/media/video";

export type TimelineComment = { id: string; authorId: string; authorName: string; body: string; createdAt: string };

export type TimelinePost = {
  id: string;
  /** The profile it was posted on. */
  personId: string;
  authorId: string;
  authorName: string;
  title: string | null;
  body: string | null;
  /** "YYYY-01-01" when a year was given. */
  dateValue: string | null;
  datePrecision: string;
  location: string | null;
  video: { provider: VideoProvider; ref: string; url: string } | null;
  createdAt: string;
  edited: boolean;
  media: { id: string; width: number | null; height: number | null }[];
  tagIds: string[];
  hearts: number;
  hearted: boolean;
  comments: TimelineComment[];
};

/** What the viewer may do on this profile's timeline. */
export type TimelineViewer = {
  userId: string;
  name: string;
  isAdmin: boolean;
  /** Their account is linked to this profile's person. */
  ownsProfile: boolean;
  /** Their account is linked to this person (for removing their own tags). */
  personId: string | null;
};

/** Who can delete a post: its author, the profile's owner, or an admin. */
export function canDeletePost(post: Pick<TimelinePost, "authorId" | "personId">, viewer: TimelineViewer, profilePersonId: string): boolean {
  return post.authorId === viewer.userId || viewer.isAdmin || (viewer.ownsProfile && post.personId === profilePersonId);
}

/** Who can delete a comment: its author, the post's author, the profile's owner, or an admin. */
export function canDeleteComment(
  comment: Pick<TimelineComment, "authorId">,
  post: Pick<TimelinePost, "authorId" | "personId">,
  viewer: TimelineViewer,
  profilePersonId: string,
): boolean {
  return comment.authorId === viewer.userId || canDeletePost(post, viewer, profilePersonId);
}

/** Who can remove a tag: the post's author, the tagged person's owner, or an admin. */
export function canRemoveTag(post: Pick<TimelinePost, "authorId">, taggedPersonId: string, viewer: TimelineViewer): boolean {
  return post.authorId === viewer.userId || viewer.isAdmin || viewer.personId === taggedPersonId;
}

/**
 * Timeline order: memories with a year, newest first, grouped by decade;
 * undated posts sit at the top under "Recently shared", newest first.
 */
export function decadeOf(dateValue: string | null): number | null {
  const y = dateValue ? Number(dateValue.slice(0, 4)) : NaN;
  return Number.isFinite(y) ? Math.floor(y / 10) * 10 : null;
}
