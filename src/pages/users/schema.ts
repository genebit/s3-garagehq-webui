import { z } from "zod";

const roleEnum = z.enum(["owner", "admin", "developer"]);

const optionalPassword = z
  .union([z.literal(""), z.string().min(6, "Password must be at least 6 characters")])
  .optional();

const optionalEmail = z
  .union([z.literal(""), z.string().email("Enter a valid email")])
  .optional();

export const createUserSchema = z
  .object({
    username: z.string().min(1, "Username is required"),
    email: optionalEmail,
    password: optionalPassword,
    role: roleEnum,
    buckets: z.array(z.string()).optional(),
  })
  .refine((d) => !!d.password || !!d.email, {
    message: "Provide a password or an email for Google sign-in",
    path: ["password"],
  });

export const editUserSchema = z.object({
  username: z.string().min(1, "Username is required"),
  email: optionalEmail,
  password: optionalPassword,
  role: roleEnum,
  buckets: z.array(z.string()).optional(),
});

export type UserSchema = z.infer<typeof editUserSchema>;
