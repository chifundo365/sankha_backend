import * as z from "zod";

export const loginSchema = z.object({
  body: z.object({
    email: z.email(),
    password: z.string().nonempty({ message: "Password is required" })
  })
});

export type LoginInput = z.infer<typeof loginSchema>["body"];
    