import { z } from "zod";

export const magicLinkSchema = z.object({
  email: z.string().email().max(254),
});

export type MagicLinkInput = z.infer<typeof magicLinkSchema>;
