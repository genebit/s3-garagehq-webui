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
import { useAuth } from "@/hooks/useAuth";

const HomePage = () => {
  const auth = useAuth();
  const isManager = !!auth.isManager;

  // Cluster health and the user list are manager-only endpoints — developers
  // get a 403 from the API, so these are only fetched for owner/admin.
  const { data: health } = useNodesHealth({ enabled: isManager });
  const { data: users } = useUsers({ enabled: isManager });
  // Buckets are already scoped server-side: developers only ever receive the
  // buckets assigned to them, so this is safe to fetch for every role.
  const { data: buckets } = useBuckets();

  const totalUsage = useMemo(() => {
    return buckets?.reduce((acc, bucket) => acc + bucket.bytes, 0);
  }, [buckets]);

  const totalObjects = useMemo(() => {
    return buckets?.reduce((acc, bucket) => acc + bucket.objects, 0);
  }, [buckets]);

  return (
    <div>
      <Page title="Dashboard" />

      {/* Primary KPIs */}
      <section
        className={cn(
          "grid grid-cols-1 gap-4 sm:grid-cols-2",
          isManager ? "lg:grid-cols-3 xl:grid-cols-5" : "lg:grid-cols-3"
        )}
      >
        {isManager ? (
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
        ) : null}
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
          title={isManager ? "Buckets" : "My buckets"}
          icon={Archive}
          value={buckets?.length}
        />
        {isManager ? (
          <StatsCard title="Users" icon={UsersRound} value={users?.length} />
        ) : null}
      </section>

      {/* Charts */}
      <section
        className={cn(
          "mt-4 grid grid-cols-1 gap-4 md:mt-6",
          isManager && "lg:grid-cols-2"
        )}
      >
        <BucketUsageChart buckets={buckets} />
        {isManager ? <UserRolesChart users={users} /> : null}
      </section>

      {/* Tables */}
      <section
        className={cn(
          "mt-4 grid grid-cols-1 gap-4 md:mt-6",
          isManager && "lg:grid-cols-2"
        )}
      >
        <BucketsTable buckets={buckets} />
        {isManager ? <UsersTable users={users} /> : null}
      </section>

      {/* Cluster details — owner/admin only; developers can't reach the
          cluster health endpoint. */}
      {isManager ? (
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
      ) : null}
    </div>
  );
};

export default HomePage;
