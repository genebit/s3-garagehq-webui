import Page from "@/context/page-context";
import { useNodesHealth } from "./hooks";
import StatsCard from "./components/stats-card";
import BucketUsageChart from "./components/bucket-usage-chart";
import UserRolesChart from "./components/user-roles-chart";
import BucketsTable from "./components/buckets-table";
import UsersTable from "./components/users-table";
import {
  Archive,
  Database,
  DatabaseZap,
  FileBox,
  FileCheck,
  FileClock,
  HardDrive,
  HardDriveUpload,
  Leaf,
  PieChart,
  UsersRound,
} from "lucide-react";
import { cn, readableBytes, ucfirst } from "@/lib/utils";
import { useBuckets } from "../buckets/hooks";
import { useUsers } from "../users/hooks";
import { useMemo } from "react";

const HomePage = () => {
  const { data: health } = useNodesHealth();
  const { data: buckets } = useBuckets();
  const { data: users } = useUsers();

  const totalUsage = useMemo(() => {
    return buckets?.reduce((acc, bucket) => acc + bucket.bytes, 0);
  }, [buckets]);

  const totalObjects = useMemo(() => {
    return buckets?.reduce((acc, bucket) => acc + bucket.objects, 0);
  }, [buckets]);

  return (
    <div className="container">
      <Page title="Dashboard" />

      {/* Primary KPIs */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatsCard
          title="Cluster status"
          icon={Leaf}
          value={ucfirst(health?.status)}
          valueClassName={cn(
            health?.status === "healthy"
              ? "text-emerald-500"
              : health?.status === "degraded"
                ? "text-amber-500"
                : "text-red-500"
          )}
        />
        <StatsCard
          title="Total usage"
          icon={PieChart}
          value={readableBytes(totalUsage)}
        />
        <StatsCard
          title="Total objects"
          icon={FileBox}
          value={totalObjects?.toLocaleString()}
        />
        <StatsCard
          title="Buckets"
          icon={Archive}
          value={buckets?.length}
        />
        <StatsCard
          title="Users"
          icon={UsersRound}
          value={users?.length}
        />
      </section>

      {/* Charts */}
      <section className="mt-4 grid grid-cols-1 gap-4 md:mt-6 lg:grid-cols-2">
        <BucketUsageChart buckets={buckets} />
        <UserRolesChart users={users} />
      </section>

      {/* Tables */}
      <section className="mt-4 grid grid-cols-1 gap-4 md:mt-6 lg:grid-cols-2">
        <BucketsTable buckets={buckets} />
        <UsersTable users={users} />
      </section>

      {/* Cluster details */}
      <section className="mt-4 md:mt-6">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Cluster details
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <StatsCard title="Nodes" icon={HardDrive} value={health?.knownNodes} />
          <StatsCard
            title="Connected nodes"
            icon={HardDriveUpload}
            value={health?.connectedNodes}
          />
          <StatsCard
            title="Storage nodes"
            icon={Database}
            value={health?.storageNodes}
          />
          <StatsCard
            title="Active storage nodes"
            icon={DatabaseZap}
            value={health?.storageNodesOk}
          />
          <StatsCard
            title="Partitions"
            icon={FileBox}
            value={health?.partitions}
          />
          <StatsCard
            title="Partitions quorum"
            icon={FileClock}
            value={health?.partitionsQuorum}
          />
          <StatsCard
            title="Active partitions"
            icon={FileCheck}
            value={health?.partitionsAllOk}
          />
        </div>
      </section>
    </div>
  );
};

export default HomePage;
