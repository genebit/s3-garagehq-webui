import api from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

export type Role = "owner" | "admin" | "developer";

export type AuthUser = {
  id: string;
  username: string;
  email: string;
  role: Role;
  buckets: string[];
  createdAt: string;
};

type AuthResponse = {
  enabled: boolean;
  authenticated: boolean;
  needsSetup: boolean;
  googleEnabled: boolean;
  user: AuthUser | null;
};

export const useAuth = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["auth"],
    queryFn: () => api.get<AuthResponse>("/auth/status"),
    retry: false,
  });

  const role = data?.user?.role;

  return {
    isLoading,
    isEnabled: data?.enabled,
    isAuthenticated: data?.authenticated,
    needsSetup: data?.needsSetup,
    googleEnabled: data?.googleEnabled,
    user: data?.user ?? null,
    role,
    isOwner: role === "owner",
    isAdmin: role === "admin",
    isManager: role === "owner" || role === "admin",
    isDeveloper: role === "developer",
  };
};
