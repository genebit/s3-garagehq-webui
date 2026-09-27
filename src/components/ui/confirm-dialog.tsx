import { useRef } from "react";
import { useStore } from "zustand";
import { confirmStore, settleConfirm } from "@/lib/confirm";
import Button from "./button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog";

const ConfirmDialog = () => {
  const options = useStore(confirmStore, (s) => s.options);
  // Keep showing the last content while the dialog animates closed.
  const lastRef = useRef(options);
  if (options) lastRef.current = options;
  const shown = options ?? lastRef.current;

  return (
    <Dialog
      open={!!options}
      onOpenChange={(open) => !open && settleConfirm(false)}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{shown?.title}</DialogTitle>
          {shown?.description ? (
            <DialogDescription>{shown.description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => settleConfirm(false)}>
            {shown?.cancelText || "Cancel"}
          </Button>
          <Button
            variant={shown?.destructive ? "destructive" : "default"}
            onClick={() => settleConfirm(true)}
          >
            {shown?.confirmText || "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConfirmDialog;
