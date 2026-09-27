import { Search, X } from "lucide-react";
import Input from "@/components/ui/input";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

const SearchBox = ({ value, onChange }: Props) => (
  <div className="relative">
    <Search
      size={15}
      className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
    />
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Search this folder…"
      aria-label="Search this folder"
      className="h-9 w-40 pl-8 pr-8 md:w-56"
    />
    {value ? (
      <button
        type="button"
        aria-label="Clear search"
        onClick={() => onChange("")}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        <X size={15} />
      </button>
    ) : null}
  </div>
);

export default SearchBox;
