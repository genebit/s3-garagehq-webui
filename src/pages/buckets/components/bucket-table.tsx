import { Bucket } from "../types";
import { ArchiveIcon } from "lucide-react";
import { readableBytes } from "@/lib/utils";
import Button from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Props = {
  items: (Bucket & { aliases: string[] })[];
};

const BucketTable = ({ items }: Props) => {
  return (
    <Card className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Usage</TableHead>
            <TableHead>Objects</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((bucket) => (
            <TableRow key={bucket.id}>
              <TableCell>
                <span className="flex items-center gap-3 font-medium">
                  <ArchiveIcon size={18} className="shrink-0" />
                  <span className="truncate">{bucket.aliases?.join(", ")}</span>
                </span>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {readableBytes(bucket.bytes)}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {bucket.objects}
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    href={`/buckets/${bucket.id}`}
                  >
                    Manage
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    href={`/buckets/${bucket.id}?tab=browse`}
                  >
                    Browse
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
};

export default BucketTable;
