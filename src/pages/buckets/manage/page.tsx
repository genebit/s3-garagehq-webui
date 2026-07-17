import { useParams } from "react-router-dom";
import { useBucket } from "./hooks";
import Page from "@/context/page-context";
import TabView, { Tab } from "@/components/containers/tab-view";
import {
  ChartLine,
  CircleXIcon,
  FolderSearch,
  LockKeyhole,
} from "lucide-react";
import OverviewTab from "./overview/overview-tab";
import PermissionsTab from "./permissions/permissions-tab";
import MenuButton from "./components/menu-button";
import BrowseTab from "./browse/browse-tab";
import { BucketContext } from "./context";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useMemo } from "react";

const ManageBucketPage = () => {
  const { id } = useParams();
  const { data, error, isLoading, refetch } = useBucket(id);
  const auth = useAuth();
  const canManage = !!auth.isManager;

  const tabs = useMemo<Tab[]>(() => {
    const list: Tab[] = [
      {
        name: "overview",
        title: "Overview",
        icon: ChartLine,
        Component: OverviewTab,
      },
    ];

    // Key/permission management is reserved for owners and admins.
    if (canManage) {
      list.push({
        name: "permissions",
        title: "Permissions",
        icon: LockKeyhole,
        Component: PermissionsTab,
      });
    }

    list.push({
      name: "browse",
      title: "Browse",
      icon: FolderSearch,
      Component: BrowseTab,
    });

    return list;
  }, [canManage]);

  const name = data?.globalAliases[0];

  return (
    <>
      <Page
        title={name || "Manage Bucket"}
        prev="/buckets"
        actions={data && canManage ? <MenuButton /> : undefined}
      />

      {isLoading && (
        <div className="flex h-full items-center justify-center">
          <Loader2 size={32} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {error != null && (
        <Alert variant="destructive">
          <CircleXIcon />
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      {data && (
        <div className="container">
          <BucketContext.Provider
            value={{ bucket: data, refetch, bucketName: name || "", canManage }}
          >
            <TabView tabs={tabs} />
          </BucketContext.Provider>
        </div>
      )}
    </>
  );
};

export default ManageBucketPage;
