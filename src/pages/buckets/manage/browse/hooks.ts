import api from "@/lib/api";
import {
  useMutation,
  UseMutationOptions,
  useQuery,
} from "@tanstack/react-query";
import {
  GetObjectsResult,
  PutObjectPayload,
  UseBrowserObjectOptions,
} from "./types";

export const useBrowseObjects = (
  bucket: string,
  options?: UseBrowserObjectOptions
) => {
  return useQuery({
    queryKey: ["browse", bucket, options],
    queryFn: () =>
      api.get<GetObjectsResult>(`/browse/${bucket}`, { params: options }),
  });
};

export const usePutObject = (
  bucket: string,
  options?: UseMutationOptions<any, Error, PutObjectPayload>
) => {
  return useMutation({
    mutationFn: async (body) => {
      const formData = new FormData();
      if (body.file) {
        formData.append("file", body.file);
      }

      return api.put(`/browse/${bucket}/${body.key}`, { body: formData });
    },
    ...options,
  });
};

export const useDeleteObject = (
  bucket: string,
  options?: UseMutationOptions<any, Error, { key: string; recursive?: boolean }>
) => {
  return useMutation({
    mutationFn: (data) =>
      api.delete(`/browse/${bucket}/${data.key}`, {
        params: { recursive: data.recursive },
      }),
    ...options,
  });
};

export const useDeleteObjects = (
  bucket: string,
  options?: UseMutationOptions<any, Error, string[]>
) => {
  return useMutation({
    mutationFn: (keys) =>
      Promise.all(
        keys.map((key) =>
          api.delete(`/browse/${bucket}/${key}`, {
            params: { recursive: key.endsWith("/") },
          })
        )
      ),
    ...options,
  });
};

export const useMoveObjects = (
  bucket: string,
  options?: UseMutationOptions<
    { moved: number },
    Error,
    { items: string[]; destination: string }
  >
) => {
  return useMutation({
    mutationFn: (body) => api.post(`/browse/${bucket}`, { body }),
    ...options,
  });
};
