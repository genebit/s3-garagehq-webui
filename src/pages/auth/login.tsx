import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { loginSchema } from "./schema";
import { useLogin } from "./hooks";
import { useAuth } from "@/hooks/useAuth";
import { API_URL } from "@/lib/api";
import { forwardRef, InputHTMLAttributes, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import garageLogo from "@/assets/garage-logo.svg";

export default function LoginPage() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });
  const login = useLogin();
  const auth = useAuth();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const error = searchParams.get("error");
    if (error) {
      toast.error(error);
    }
  }, [searchParams]);

  return (
    <div className="fixed inset-0 grid grid-cols-1 md:grid-cols-2 overflow-y-auto">
      <PromoPanel />

      {/* Auth panel */}
      <div className="flex items-center justify-center bg-[#0b0f1a] px-6 py-10 text-slate-100">
        <div className="w-full max-w-sm">
          <img src={garageLogo} alt="Garage" className="h-10 w-auto" />
          <h1 className="mt-5 text-lg font-semibold">
            Sign in to the admin panel
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage buckets, keys, and cluster health.
          </p>

          {auth.googleEnabled ? (
            <>
              <button
                type="button"
                onClick={() => {
                  window.location.href = `${API_URL}/v1/auth/google/login`;
                }}
                className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-slate-800 transition hover:bg-slate-100"
              >
                <GoogleIcon />
                Sign in with Google
              </button>

              <div className="my-5 flex items-center gap-3 text-xs font-medium text-slate-500">
                <div className="h-px flex-1 bg-slate-700" />
                OR
                <div className="h-px flex-1 bg-slate-700" />
              </div>
            </>
          ) : null}

          <form
            onSubmit={handleSubmit((v) => login.mutate(v))}
            className="space-y-4"
          >
            <Field
              label="Username"
              error={errors.username?.message}
              type="text"
              placeholder="Enter your username"
              autoComplete="username"
              {...register("username")}
            />

            <Field
              label="Password"
              error={errors.password?.message}
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              {...register("password")}
            />

            <button
              type="submit"
              disabled={login.isPending}
              className="mt-2 w-full rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 disabled:opacity-60"
            >
              {login.isPending ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

type FieldProps = {
  label: string;
  error?: string;
} & InputHTMLAttributes<HTMLInputElement>;

const Field = forwardRef<HTMLInputElement, FieldProps>(
  ({ label, error, type, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === "password";
    const inputType = isPassword && showPassword ? "text" : type;

    return (
      <div>
        <label className="mb-1.5 flex items-center gap-1 text-sm font-medium text-slate-200">
          {label}
          <span className="text-rose-500">•</span>
        </label>
        <div className="relative">
          <input
            ref={ref}
            {...props}
            type={inputType}
            className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-slate-400"
            style={isPassword ? { paddingRight: "2.75rem" } : undefined}
          />
          {isPassword ? (
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 transition hover:text-slate-200"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          ) : null}
        </div>
        {error ? <p className="mt-1 text-xs text-rose-400">{error}</p> : null}
      </div>
    );
  }
);

const PromoPanel = () => {
  return (
    <div className="relative hidden flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-violet-200 via-white to-slate-100 px-12 py-10 md:flex">
      <DashboardPreview />

      <div className="mt-10 max-w-md text-center">
        <h2 className="text-2xl font-bold text-slate-900">
          Manage your object storage with ease
        </h2>
        <p className="mt-3 text-sm text-slate-500">
          Garage Web UI — browse buckets, manage access keys, and monitor
          cluster health, all in one place.
        </p>
      </div>
    </div>
  );
};

// A stylized mock of the Garage dashboard, evoking the real app screenshot.
const DashboardPreview = () => {
  return (
    <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-800 bg-[#0b1220] shadow-2xl shadow-slate-900/30">
      {/* window bar */}
      <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
      </div>

      <div className="flex">
        {/* sidebar */}
        <div className="w-1/3 space-y-2 border-r border-white/10 p-3">
          <div className="mb-3 flex items-center gap-1.5">
            <img src={garageLogo} alt="" className="h-5 w-5" />
            <div className="h-2 w-10 rounded bg-white/20" />
          </div>
          <div className="h-6 rounded bg-cyan-400/80" />
          <div className="h-6 rounded bg-white/5" />
          <div className="h-6 rounded bg-white/5" />
          <div className="h-6 rounded bg-white/5" />
        </div>

        {/* content */}
        <div className="flex-1 p-3">
          <div className="mb-3 h-2 w-16 rounded bg-white/20" />
          <div className="grid grid-cols-2 gap-2">
            {["Healthy", "1 Node", "256", "Quorum"].map((label, i) => (
              <div
                key={label}
                className="rounded-lg border border-white/10 bg-white/5 p-2.5"
              >
                <div
                  className={`mb-1.5 h-3 w-8 rounded ${
                    i === 0 ? "bg-emerald-400/80" : "bg-white/30"
                  }`}
                />
                <div className="h-1.5 w-12 rounded bg-white/10" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path
      fill="#FFC107"
      d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
    />
    <path
      fill="#FF3D00"
      d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
    />
    <path
      fill="#4CAF50"
      d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
    />
    <path
      fill="#1976D2"
      d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
    />
  </svg>
);
