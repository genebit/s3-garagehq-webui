import { Moon, Sun } from "lucide-react";
import appStore from "@/stores/app-store";
import { useStore } from "zustand";
import Button from "@/components/ui/button";

const ThemeToggle = () => {
  const mode = useStore(appStore, (i) => i.mode);
  const isDark = mode === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => appStore.toggleMode()}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </Button>
  );
};

export default ThemeToggle;
