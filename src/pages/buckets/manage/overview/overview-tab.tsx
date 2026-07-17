import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartPie, ChartScatter } from "lucide-react";
import { readableBytes } from "@/lib/utils";
import WebsiteAccessSection from "./overview-website-access";
import AliasesSection from "./overview-aliases";
import QuotaSection from "./overview-quota";
import { useBucketContext } from "../context";

const OverviewTab = () => {
  const { bucket: data, canManage } = useBucketContext();

  return (
    <div className="grid grid-cols-1 items-start gap-4 md:gap-8 lg:grid-cols-2">
      <Card className="order-2 md:order-1">
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <AliasesSection />
          {canManage ? (
            <>
              <WebsiteAccessSection />
              <QuotaSection />
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card className="order-1 md:order-2">
        <CardHeader>
          <CardTitle>Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-row gap-3">
              <ChartPie className="mt-1" size={20} />
              <div className="flex-1">
                <p className="flex items-center gap-1 text-sm">Storage</p>
                <p className="text-2xl font-medium">
                  {readableBytes(data?.bytes)}
                </p>
              </div>
            </div>

            <div className="flex flex-row gap-3">
              <ChartScatter className="mt-1" size={20} />
              <div className="flex-1">
                <p className="flex items-center gap-1 text-sm">Objects</p>
                <p className="text-2xl font-medium">{data?.objects}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default OverviewTab;
