import { describe, expect, it } from "vitest";
import { confirmDialog, confirmStore, settleConfirm } from "./confirm";

describe("confirmDialog", () => {
  it("resolves with the user's answer and clears the dialog", async () => {
    const answer = confirmDialog({ title: "Delete?" });
    expect(confirmStore.getState().options?.title).toBe("Delete?");
    settleConfirm(true);
    await expect(answer).resolves.toBe(true);
    expect(confirmStore.getState().options).toBeNull();
  });

  it("settles a replaced request as cancelled", async () => {
    const first = confirmDialog({ title: "First" });
    const second = confirmDialog({ title: "Second" });
    await expect(first).resolves.toBe(false);
    settleConfirm(true);
    await expect(second).resolves.toBe(true);
  });
});
