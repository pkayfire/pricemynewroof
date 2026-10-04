import { z } from "zod";

/** Request body for POST /api/do-not-sell. Email or phone identifies the records to opt out. */
export const doNotSellSchema = z
  .object({
    name: z.string().trim().max(200).optional().default(""),
    email: z.string().trim().max(254).optional().default(""),
    phone: z.string().trim().max(40).optional().default(""),
    state: z.string().trim().regex(/^[A-Z]{2}$/).optional(),
    requestType: z.enum(["opt_out_sale_share", "limit_sensitive"]).default("opt_out_sale_share"),
    authorizedAgent: z.boolean().default(false),
    details: z.string().trim().max(2000).optional().default(""),
  })
  .refine((v) => v.email.length > 0 || v.phone.length > 0, { message: "email or phone required" })
  .refine((v) => v.email.length === 0 || z.string().email().safeParse(v.email).success, { message: "invalid email" })
  .refine((v) => v.phone.length === 0 || v.phone.replace(/\D/g, "").length >= 10, { message: "invalid phone" });

export type DoNotSellRequest = z.infer<typeof doNotSellSchema>;
