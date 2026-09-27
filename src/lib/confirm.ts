import { ReactNode } from "react";
import { createStore } from "zustand";

export type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

type ConfirmState = {
  options: ConfirmOptions | null;
  resolve: ((value: boolean) => void) | null;
};

export const confirmStore = createStore<ConfirmState>(() => ({
  options: null,
  resolve: null,
}));

/** Shows the app's confirmation dialog. Resolves true if the user confirms,
 * false if they cancel or dismiss it. */
export const confirmDialog = (options: ConfirmOptions) =>
  new Promise<boolean>((resolve) => {
    // A new request replaces any dialog still open; that one counts as cancelled.
    confirmStore.getState().resolve?.(false);
    confirmStore.setState({ options, resolve });
  });

export const settleConfirm = (value: boolean) => {
  const { resolve } = confirmStore.getState();
  confirmStore.setState({ options: null, resolve: null });
  resolve?.(value);
};
