import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Button from "./button";

type PaginationProps = {
  /** 1-based current page. */
  page: number;
  onPageChange: (page: number) => void;
  /** Known page count; renders numbered page buttons. */
  totalPages?: number;
  /** For cursor-based lists without a total: whether a next page exists. */
  hasNext?: boolean;
  /** Left-aligned caption, e.g. "Showing 1–15 of 42". */
  summary?: React.ReactNode;
  className?: string;
};

// Page numbers to render, with null marking a gap ("…"). Always includes the
// first/last page and a window around the current one.
const pageWindow = (page: number, total: number, radius = 1) => {
  const pages: (number | null)[] = [];
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || Math.abs(i - page) <= radius) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== null) {
      pages.push(null);
    }
  }
  return pages;
};

const Pagination = ({
  page,
  onPageChange,
  totalPages,
  hasNext,
  summary,
  className,
}: PaginationProps) => {
  const canNext = totalPages != null ? page < totalPages : !!hasNext;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground",
        className
      )}
    >
      <span>{summary}</span>

      <nav aria-label="Pagination" className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft size={16} />
        </Button>

        {totalPages != null ? (
          pageWindow(page, totalPages).map((p, i) =>
            p == null ? (
              <span key={`gap-${i}`} className="px-1">
                …
              </span>
            ) : (
              <Button
                key={p}
                variant={p === page ? "default" : "ghost"}
                size="icon"
                aria-current={p === page ? "page" : undefined}
                onClick={() => onPageChange(p)}
              >
                {p}
              </Button>
            )
          )
        ) : (
          <span className="px-2">Page {page}</span>
        )}

        <Button
          variant="outline"
          size="icon"
          aria-label="Next page"
          disabled={!canNext}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight size={16} />
        </Button>
      </nav>
    </div>
  );
};

export default Pagination;
