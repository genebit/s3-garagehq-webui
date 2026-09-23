import Page from "@/context/page-context";
import { useBuckets } from "./hooks";
import Input from "@/components/ui/input";
import BucketCard from "./components/bucket-card";
import BucketTable from "./components/bucket-table";
import CreateBucketDialog from "./components/create-bucket-dialog";
import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSearchParams } from "react-router-dom";
import { useStore } from "zustand";
import appStore, { BucketsView } from "@/stores/app-store";
import Pagination from "@/components/ui/pagination";
import Button from "@/components/ui/button";
import { LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 15;

const BucketsPage = () => {
  const { data } = useBuckets();
  const [search, setSearch] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const view = useStore(appStore, (s) => s.bucketsView);
  const auth = useAuth();

  const items = useMemo(() => {
    let buckets =
      data?.map((bucket) => {
        return {
          ...bucket,
          aliases: [
            ...(bucket.globalAliases || []),
            ...(bucket.localAliases?.map((l) => l.alias) || []),
          ],
        };
      }) || [];

    if (search?.length > 0) {
      const q = search.toLowerCase();
      buckets = buckets.filter(
        (bucket) =>
          bucket.id.includes(q) ||
          bucket.aliases.find((alias) => alias.includes(q))
      );
    }

    buckets = buckets.sort((a, b) => a.aliases[0].localeCompare(b.aliases[0]));

    return buckets;
  }, [data, search]);

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const page = Math.min(
    Math.max(1, Number(searchParams.get("page")) || 1),
    totalPages
  );
  const pageItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const setPage = (value: number) => {
    const params = new URLSearchParams(searchParams);
    if (value > 1) {
      params.set("page", String(value));
    } else {
      params.delete("page");
    }
    setSearchParams(params);
  };

  const onSearchChange = (value: string) => {
    setSearch(value);
    if (page !== 1) setPage(1);
  };

  const rangeStart = items.length ? (page - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min(page * PAGE_SIZE, items.length);

  return (
    <div className="container">
      <Page title="Buckets" />

      <div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <Input
            placeholder="Search..."
            className="sm:max-w-xs"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          <div className="flex-1" />
          <ViewToggle value={view} onChange={appStore.setBucketsView} />
          {auth.isManager ? <CreateBucketDialog /> : null}
        </div>

        <div className="mt-4 md:mt-8">
          {view === "list" ? (
            pageItems.length ? (
              <BucketTable items={pageItems} />
            ) : null
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-8 items-stretch">
              {pageItems.map((bucket) => (
                <BucketCard key={bucket.id} data={bucket} />
              ))}
            </div>
          )}

          {data && !items.length ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No buckets found
            </p>
          ) : null}
        </div>

        {items.length > 0 ? (
          <Pagination
            className="mt-4 md:mt-8"
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            summary={`Showing ${rangeStart}–${rangeEnd} of ${items.length}`}
          />
        ) : null}
      </div>
    </div>
  );
};

type ViewToggleProps = {
  value: BucketsView;
  onChange: (value: BucketsView) => void;
};

const ViewToggle = ({ value, onChange }: ViewToggleProps) => {
  const options = [
    { value: "grid", label: "Grid view", icon: LayoutGrid },
    { value: "list", label: "List view", icon: List },
  ] as const;

  return (
    <div
      role="group"
      aria-label="Layout"
      className="inline-flex self-start rounded-md border p-0.5 sm:self-auto"
    >
      {options.map((opt) => (
        <Button
          key={opt.value}
          variant="ghost"
          size="icon"
          aria-label={opt.label}
          aria-pressed={value === opt.value}
          title={opt.label}
          className={cn(
            "h-8 w-8",
            value === opt.value && "bg-accent text-accent-foreground"
          )}
          onClick={() => onChange(opt.value)}
        >
          <opt.icon size={16} />
        </Button>
      ))}
    </div>
  );
};

export default BucketsPage;
