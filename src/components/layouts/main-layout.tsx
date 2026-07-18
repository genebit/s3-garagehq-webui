import { PageContext } from "@/context/page-context";
import { Suspense, useContext, useEffect } from "react";
import {
  Link,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import Sidebar from "../containers/sidebar";
import { ArrowLeft, ChevronRight, MenuIcon } from "lucide-react";
import { useDisclosure } from "@/hooks/useDisclosure";
import { useAuth } from "@/hooks/useAuth";
import UserMenu from "../containers/user-menu";
import ThemeToggle from "../containers/theme-toggle";
import Button from "../ui/button";
import UploadPanel from "../containers/upload-panel";

const MainLayout = () => {
  const sidebar = useDisclosure();
  const { pathname } = useLocation();
  const auth = useAuth();

  useEffect(() => {
    if (sidebar.isOpen) {
      sidebar.onClose();
    }
  }, [pathname]);

  if (auth.isLoading) {
    return null;
  }

  if (!auth.isAuthenticated) {
    return <Navigate to="/auth/login" />;
  }

  // Developers may only reach their dashboard, the buckets area, and their
  // keys; send them to the dashboard from anywhere else.
  if (auth.isDeveloper) {
    const allowed =
      pathname === "/" ||
      pathname === "/buckets" ||
      pathname.startsWith("/buckets/") ||
      pathname === "/keys";
    if (!allowed) {
      return <Navigate to="/" replace />;
    }
  }

  return (
    <div className="flex h-screen max-h-dvh overflow-hidden bg-background text-foreground">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Mobile sidebar */}
      {sidebar.isOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={sidebar.onClose}
          />
          <div className="absolute inset-y-0 left-0 z-50">
            <Sidebar />
          </div>
        </div>
      ) : null}

      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onSidebarOpen={sidebar.onOpen} />

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <Suspense>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <UploadPanel />
    </div>
  );
};

type HeaderProps = {
  onSidebarOpen: () => void;
};

const Header = ({ onSidebarOpen }: HeaderProps) => {
  const page = useContext(PageContext);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const section = pathname.split("/").filter(Boolean)[0];
  const sectionTitle = section
    ? section.charAt(0).toUpperCase() + section.slice(1)
    : null;
  const sectionPath = section ? `/${section}` : "/";
  const showBreadcrumb =
    sectionTitle && page?.title && page.title.toLowerCase() !== section;

  return (
    <header className="border-b bg-background">
      <div className="flex h-16 items-center gap-3 px-4 md:px-8">
        {page?.prev ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back"
            className="-ml-2 rounded-full"
            onClick={() => navigate(page.prev!, { replace: true })}
          >
            <ArrowLeft size={20} />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open menu"
            className="-ml-2 rounded-full md:hidden"
            onClick={onSidebarOpen}
          >
            <MenuIcon size={20} />
          </Button>
        )}

        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {showBreadcrumb ? (
            <>
              <Link
                to={sectionPath}
                className="shrink-0 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {sectionTitle}
              </Link>
              <ChevronRight
                size={14}
                className="shrink-0 text-muted-foreground"
              />
              <h1 className="truncate text-sm font-medium">{page.title}</h1>
            </>
          ) : (
            <h1 className="truncate text-lg font-semibold">
              {page?.title || "Dashboard"}
            </h1>
          )}
        </div>

        <div className="flex items-center gap-2">
          {page?.actions}
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
};

export default MainLayout;
