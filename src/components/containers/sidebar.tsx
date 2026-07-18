import { cn } from "@/lib/utils";
import {
  ArchiveIcon,
  Github,
  HardDrive,
  KeySquare,
  LayoutDashboard,
  ScrollText,
  UsersRound,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import garageLogo from "@/assets/garage-logo.svg";
import { Role, useAuth } from "@/hooks/useAuth";

const managerRoles: Role[] = ["owner", "admin"];

const pages: {
  icon: typeof LayoutDashboard;
  title: string;
  path: string;
  exact?: boolean;
  roles?: Role[];
}[] = [
  {
    icon: LayoutDashboard,
    title: "Dashboard",
    path: "/",
    exact: true,
  },
  { icon: HardDrive, title: "Cluster", path: "/cluster", roles: managerRoles },
  { icon: ArchiveIcon, title: "Buckets", path: "/buckets" },
  { icon: KeySquare, title: "Keys", path: "/keys" },
  { icon: UsersRound, title: "Users", path: "/users", roles: managerRoles },
  { icon: ScrollText, title: "Logs", path: "/logs", roles: managerRoles },
];

const Sidebar = () => {
  const { pathname } = useLocation();
  const auth = useAuth();

  const visiblePages = pages.filter(
    (page) => !page.roles || (auth.role && page.roles.includes(auth.role))
  );

  return (
    <aside className="flex h-full w-[80%] flex-col overflow-hidden border-r bg-card md:w-[250px]">
      <div className="flex items-center gap-2 p-4">
        <img src={garageLogo} alt="logo" className="h-9 w-9" />
        <div className="leading-tight">
          <p className="text-sm font-semibold">Garage</p>
          <p className="text-xs text-muted-foreground">Web UI</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {visiblePages.map((page) => {
          const isActive = page.exact
            ? pathname === page.path
            : pathname.startsWith(page.path);
          return (
            <Link
              key={page.path}
              to={page.path}
              className={cn(
                "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <page.icon size={18} />
              <span>{page.title}</span>
            </Link>
          );
        })}
      </nav>

      {auth.user ? (
        <div className="border-t px-4 py-3">
          <p className="truncate text-sm font-medium">{auth.user.username}</p>
          <p className="text-xs capitalize text-muted-foreground">
            {auth.user.role}
          </p>
        </div>
      ) : null}

      <div className="border-t p-3">
        <a
          href="https://github.com/khairul169/garage-webui"
          target="_blank"
          rel="noreferrer"
          className="block rounded-lg border bg-muted/40 p-3 transition-colors hover:bg-muted"
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
              GB
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">Gene T. Bitara</p>
              <p className="text-[11px] text-muted-foreground">Contributor</p>
            </div>
            <Github size={15} className="shrink-0 text-muted-foreground" />
          </div>
          <p className="mt-2 text-[10px] leading-tight text-muted-foreground">
            A fork of{" "}
            <span className="font-medium text-foreground">
              khairul169/garage-webui
            </span>
          </p>
        </a>
      </div>
    </aside>
  );
};

export default Sidebar;
