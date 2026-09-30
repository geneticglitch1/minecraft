import { describe, it, expect } from "vitest";
import { withServerOperation } from "../src/server/operation";

describe("server operation queue", () => {
  it("serializes destructive operations while allowing nested backups", async () => {
    const events: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const first = withServerOperation(async () => {
      events.push("restore-start");
      await withServerOperation(async () => { events.push("nested-backup"); });
      await gate;
      events.push("restore-finish");
    });
    const second = withServerOperation(async () => { events.push("power"); });
    await new Promise(resolve => setImmediate(resolve));
    expect(events).toEqual(["restore-start", "nested-backup"]);
    release();
    await Promise.all([first, second]);
    expect(events).toEqual(["restore-start", "nested-backup", "restore-finish", "power"]);
  });
  it("a failure does not poison later operations", async () => {
    await expect(withServerOperation(async () => { throw new Error("failed"); })).rejects.toThrow("failed");
    await expect(withServerOperation(async () => "next")).resolves.toBe("next");
  });
});
