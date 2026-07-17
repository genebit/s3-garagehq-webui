import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2, LucideIcon } from "lucide-react";
import { ButtonHTMLAttributes, forwardRef } from "react";
import { Link } from "react-router-dom";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    href?: string;
    target?: "_blank" | "_self" | "_parent" | "_top";
    icon?: LucideIcon;
    loading?: boolean;
    /** @deprecated compat with the old daisyui API; prefer `variant`. */
    color?: "primary" | "ghost" | string;
    /** @deprecated compat with the old daisyui API; prefer `size="icon"`. */
    shape?: "circle" | string;
  };

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      href,
      target,
      icon: Icon,
      loading,
      color,
      shape,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    // Map legacy daisyui-style props onto shadcn variants.
    const resolvedVariant =
      variant ??
      (color === "primary" ? "default" : color === "ghost" ? "ghost" : "outline");

    const isIconOnly = (Icon || shape === "circle") && !children;
    const resolvedSize = size ?? (isIconOnly ? "icon" : "default");

    const classes = cn(
      buttonVariants({ variant: resolvedVariant, size: resolvedSize }),
      shape === "circle" && "rounded-full",
      className
    );

    const content = (
      <>
        {loading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : Icon ? (
          <Icon size={16} />
        ) : null}
        {children}
      </>
    );

    if (href) {
      if (href.startsWith("http")) {
        return (
          <a href={href} target={target} className={classes}>
            {content}
          </a>
        );
      }
      return (
        <Link to={href} target={target} className={classes}>
          {content}
        </Link>
      );
    }

    return (
      <button
        ref={ref}
        className={classes}
        disabled={disabled || loading}
        {...props}
      >
        {content}
      </button>
    );
  }
);

export { buttonVariants };
export default Button;
