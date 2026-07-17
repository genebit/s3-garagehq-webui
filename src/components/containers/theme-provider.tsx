import appStore from "@/stores/app-store";
import { useEffect } from "react";
import { useStore } from "zustand";

const ThemeProvider = () => {
  const mode = useStore(appStore, (i) => i.mode);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", mode === "dark");
  }, [mode]);

  return null;
};

export default ThemeProvider;
