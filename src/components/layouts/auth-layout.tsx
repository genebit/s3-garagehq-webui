import { useAuth } from "@/hooks/useAuth";
import { Navigate, Outlet, useLocation } from "react-router-dom";

const AuthLayout = () => {
  const auth = useAuth();
  const { pathname } = useLocation();

  if (auth.isLoading) {
    return null;
  }

  if (auth.isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const isRegister = pathname.endsWith("/register");

  // Force the registration screen during initial setup, and keep users off it
  // once at least one account exists.
  if (auth.needsSetup && !isRegister) {
    return <Navigate to="/auth/register" replace />;
  }
  if (!auth.needsSetup && isRegister) {
    return <Navigate to="/auth/login" replace />;
  }

  return (
    <div className="min-h-svh flex items-center justify-center bg-background text-foreground">
      <Outlet />
    </div>
  );
};

export default AuthLayout;
