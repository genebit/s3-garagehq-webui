import { Role } from "@/hooks/useAuth";

export type { Role };

export type User = {
  id: string;
  username: string;
  email: string;
  role: Role;
  buckets: string[];
  createdAt: string;
};
