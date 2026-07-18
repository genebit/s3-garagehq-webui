import api from "@/lib/api";
import {
  useMutation,
  UseMutationOptions,
  useQuery,
} from "@tanstack/react-query";
import { User } from "./types";

export const useUsers = (options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<User[]>("/users"),
    enabled: options?.enabled,
  });
};

export const useCreateUser = (
  options?: UseMutationOptions<any, Error, Record<string, any>>
) => {
  return useMutation({
    mutationFn: (body) => api.post("/users", { body }),
    ...options,
  });
};

export const useUpdateUser = (
  options?: UseMutationOptions<
    any,
    Error,
    { id: string; body: Record<string, any> }
  >
) => {
  return useMutation({
    mutationFn: ({ id, body }) =>
      api.fetch(`/users/${id}`, { method: "PATCH", body }),
    ...options,
  });
};

export const useDeleteUser = (
  options?: UseMutationOptions<any, Error, string>
) => {
  return useMutation({
    mutationFn: (id) => api.delete(`/users/${id}`),
    ...options,
  });
};
