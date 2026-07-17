import api from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { LogsResponse } from "./types";

type Params = {
  search?: string;
  level?: string;
  page?: number;
  limit?: number;
  autoRefresh?: boolean;
};

export const useLogs = ({ autoRefresh, ...params }: Params) => {
  return useQuery({
    queryKey: ["logs", params],
    queryFn: () => api.get<LogsResponse>("/logs", { params }),
    refetchInterval: autoRefresh ? 3000 : false,
    placeholderData: (prev) => prev,
  });
};
