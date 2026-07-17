import { createStore } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "light" | "dark";

type AppState = {
  mode: ThemeMode;
};

const store = createStore(
  persist<AppState>(
    () => ({
      mode: "dark",
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
};

export default appStore;
