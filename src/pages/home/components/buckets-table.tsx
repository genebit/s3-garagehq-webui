import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Button from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { readableBytes } from "@/lib/utils";
import { Bucket } from "@/pages/buckets/types";
import { useMemo } from "react";

const MAX_ROWS = 6;

type Props = {
  buckets?: Bucket[];
};

const BucketsTable = ({ buckets }: Props) => {
  const rows = useMemo(
    () => [...(buckets || [])].sort((a, b) => b.bytes - a.bytes),
    [buckets]
  );
  const shown = rows.slice(0, MAX_ROWS);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Buckets</CardTitle>
        <Button variant="outline" size="sm" href="/buckets">
          View all
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bucket</TableHead>
              <TableHead>Objects</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Keys</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((bucket) => (
              <TableRow key={bucket.id}>
                <TableCell className="max-w-[160px] truncate font-medium">
                  {bucket.globalAliases?.[0] || bucket.id.slice(0, 8)}
                </TableCell>
                <TableCell className="tabular-nums">
                  {bucket.objects.toLocaleString()}
                </TableCell>
                <TableCell className="tabular-nums">
                  {readableBytes(bucket.bytes)}
                </TableCell>
                <TableCell className="tabular-nums">
                  {bucket.keys?.length || 0}
                </TableCell>
              </TableRow>
            ))}

            {!shown.length ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-8 text-center text-muted-foreground"
                >
                  No buckets yet.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>

        {rows.length > MAX_ROWS ? (
          <p className="mt-3 text-center text-xs text-muted-foreground">
            +{rows.length - MAX_ROWS} more
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default BucketsTable;
