export type UseBrowserObjectOptions = Partial<{
  prefix: string;
  limit: number;
  next: string;
  search: string;
}>;

export type GetObjectsResult = {
  prefixes: string[];
  objects: Object[];
  prefix: string;
  nextToken: string | null;
  truncated?: boolean;
};

export type Object = {
  objectKey: string;
  lastModified: Date;
  size: number;
  url: string;
};

export type PutObjectPayload = {
  key: string;
  file: File | null;
};

/** Object metadata as returned by GET /browse/{bucket}/{key} (S3 HeadObject). */
export type ObjectInfo = {
  ContentLength?: number;
  ContentType?: string;
  ETag?: string;
  LastModified?: string;
};
