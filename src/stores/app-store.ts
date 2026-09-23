import { createStore } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "light" | "dark";
export type BucketsView = "grid" | "list";

type AppState = {
  mode: ThemeMode;
  bucketsView: BucketsView;
};

const store = createStore(
  persist<AppState>(
    () => ({
      mode: "dark",
      bucketsView: "grid",
    }),
    {
      name: "appdata",
    }
  )
);

const appStore = {
  ...store,
  setMode: (mode: ThemeMode) => store.setState({ mode }),
  toggleMode: () =>
    store.setState((s) => ({ mode: s.mode === "dark" ? "light" : "dark" })),
  setBucketsView: (bucketsView: BucketsView) => store.setState({ bucketsView }),
};

export default appStore;
