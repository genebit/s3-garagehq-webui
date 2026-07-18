import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import {
  ComponentPropsWithoutRef,
  ElementRef,
  forwardRef,
  HTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

// Defaults to non-modal: a modal Radix Dialog sets `document.body.style
// .pointerEvents = "none"` while open and only re-enables it on the
// dialog's own DOM subtree. Our react-select menus portal to
// `document.body` as a sibling of the dialog content, outside that
// subtree, so under a modal dialog they become entirely unclickable.
// `onInteractOutside` below still prevents outside clicks (e.g. on a
// portaled select menu) from dismissing the dialog.
const Dialog = ({
  modal = false,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Root>) => (
  <DialogPrimitive.Root modal={modal} {...props} />
);
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

// Radix's own Overlay primitive renders nothing when the dialog is
// non-modal (see the `modal={false}` default on Dialog above), so this is a
// plain div instead — it always renders the backdrop regardless of modal
// state. It only loses the built-in exit-animation Radix's Presence would
// give it; the dialog content itself still animates in/out normally.
const DialogOverlay = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 animate-in bg-black/60 fade-in-0",
      className
    )}
    {...props}
  />
));

const DialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, onInteractOutside, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        className
      )}
      // A react-select menu portals to document.body, outside this content's
      // DOM subtree. Without this, clicking an option registers as an
      // "outside" interaction and Radix dismisses the dialog/select before
      // the click completes. Radix's outside-interaction events are
      // CustomEvents — `event.target` is the dispatch target (not the actual
      // click), so the real element is at `event.detail.originalEvent.target`.
      onInteractOutside={(e) => {
        const detail = (e as unknown as CustomEvent<{ originalEvent?: Event }>)
          .detail;
        const originalTarget = detail?.originalEvent?.target as
          | HTMLElement
          | null
          | undefined;
        if (originalTarget?.closest(".select-menu-portal")) {
          e.preventDefault();
          return;
        }
        onInteractOutside?.(e);
      }}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none disabled:pointer-events-none">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));

const DialogHeader = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col space-y-1.5 text-left", className)}
    {...props}
  />
);

const DialogFooter = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
);

const DialogTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));

const DialogDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
