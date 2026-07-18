import api from "@/lib/api";
import { GetHealthResult } from "./types";
import { useQuery } from "@tanstack/react-query";

export const useNodesHealth = (options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => api.get<GetHealthResult>("/v2/GetClusterHealth"),
    enabled: options?.enabled,
  });
};
