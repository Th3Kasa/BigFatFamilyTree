import { z } from "zod";

export const roleUpdateSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "editor", "viewer"]),
});

export type RoleUpdate = z.infer<typeof roleUpdateSchema>;
