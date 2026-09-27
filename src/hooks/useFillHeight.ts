import { RefObject, useLayoutEffect, useState } from "react";

/** Height that makes `ref`'s element reach the bottom of the viewport, less
 * the main content area's bottom padding. Recomputed on window resize. */
export const useFillHeight = (ref: RefObject<HTMLElement>, minHeight = 480) => {
  const [height, setHeight] = useState<number>();

  useLayoutEffect(() => {
    const update = () => {
      const el = ref.current;
      if (!el) return;
      const main = el.closest("main");
      const scrollTop = main?.scrollTop ?? 0;
      const padding = main
        ? parseFloat(getComputedStyle(main).paddingBottom) || 0
        : 0;
      const top = el.getBoundingClientRect().top + scrollTop;
      setHeight(Math.max(minHeight, Math.floor(window.innerHeight - top - padding)));
    };

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [ref, minHeight]);

  return height;
};
