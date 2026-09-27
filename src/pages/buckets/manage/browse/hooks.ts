import api, { APIError } from "@/lib/api";
import {
  useMutation,
  UseMutationOptions,
  useQuery,
} from "@tanstack/react-query";
import {
  GetObjectsResult,
  ObjectInfo,
  PutObjectPayload,
  UseBrowserObjectOptions,
} from "./types";
import { objectPath, TEXT_PREVIEW_BYTES } from "./browse-utils";

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
    // The object is sent as the raw request body (folders have none).
    mutationFn: (body) =>
      api.put(objectPath(bucket, body.key), { body: body.file ?? undefined }),
    ...options,
  });
};

export const useDeleteObject = (
  bucket: string,
  options?: UseMutationOptions<any, Error, { key: string; recursive?: boolean }>
) => {
  return useMutation({
    mutationFn: (data) =>
      api.delete(objectPath(bucket, data.key), {
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
          api.delete(objectPath(bucket, key), {
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

export const useRenameObject = (
  bucket: string,
  options?: UseMutationOptions<
    { key: string; moved: number },
    APIError,
    { key: string; name: string }
  >
) => {
  return useMutation({
    mutationFn: ({ key, name }) =>
      api.patch<{ key: string; moved: number }>(objectPath(bucket, key), {
        body: { name },
      }),
    ...options,
  });
};

export const useObjectInfo = (bucket: string, key: string | null) => {
  return useQuery<ObjectInfo, APIError>({
    queryKey: ["browse", bucket, "info", key],
    queryFn: () => api.get<ObjectInfo>(objectPath(bucket, key!)),
    enabled: !!key,
    retry: false,
  });
};

/** The first TEXT_PREVIEW_BYTES of a text file, via a ranged request. */
export const useTextPreview = (url: string | null, etag?: string) => {
  return useQuery({
    queryKey: ["text-preview", url, etag],
    enabled: !!url,
    retry: false,
    queryFn: async () => {
      const res = await fetch(url!, {
        credentials: "include",
        headers: { Range: `bytes=0-${TEXT_PREVIEW_BYTES - 1}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    },
  });
};
