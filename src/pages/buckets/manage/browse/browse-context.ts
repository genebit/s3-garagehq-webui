import { createContext, useContext } from "react";

export type BrowseContextValue = {
  prefix: string;
  previewKey: string | null;
  openFolder: (prefix: string) => void;
  openPreview: (key: string) => void;
  openRename: (key: string) => void;
  openMove: (keys: string[]) => void;
  deleteKeys: (keys: string[]) => Promise<boolean>;
  isDeleting: boolean;
};

export const BrowseContext = createContext<BrowseContextValue | null>(null);

export const useBrowseContext = () => {
  const value = useContext(BrowseContext);
  if (!value) {
    throw new Error("useBrowseContext must be used inside the Browse tab");
  }
  return value;
};
