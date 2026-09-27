import { describe, expect, it } from "vitest";
import {
  describeKeys,
  keyName,
  objectPath,
  previewKind,
  selectRange,
  splitExtension,
} from "./browse-utils";

describe("splitExtension", () => {
  it("splits on the last dot", () => {
    expect(splitExtension("photo.final.jpg")).toEqual(["photo.final", ".jpg"]);
  });
  it("treats dotfiles and dotless names as having no extension", () => {
    expect(splitExtension(".env")).toEqual([".env", ""]);
    expect(splitExtension("README")).toEqual(["README", ""]);
  });
});

describe("keyName", () => {
  it("returns the last segment of files and folders", () => {
    expect(keyName("a/b/c.txt")).toBe("c.txt");
    expect(keyName("a/b/")).toBe("b");
    expect(keyName("top.txt")).toBe("top.txt");
  });
});

describe("objectPath", () => {
  it("percent-encodes each key segment but keeps the slashes", () => {
    expect(objectPath("my bucket", "docs/report #1 (final)?.txt")).toBe(
      "/browse/my%20bucket/docs/report%20%231%20(final)%3F.txt"
    );
    expect(objectPath("b", "ünï/%.txt")).toBe("/browse/b/%C3%BCn%C3%AF/%25.txt");
    expect(objectPath("b", "folder/")).toBe("/browse/b/folder/");
  });
});

describe("previewKind", () => {
  it("detects images, media, pdf and text", () => {
    expect(previewKind("a.PNG")).toBe("image");
    expect(previewKind("clip", "video/mp4")).toBe("video");
    expect(previewKind("song.mp3")).toBe("audio");
    expect(previewKind("doc.pdf")).toBe("pdf");
    expect(previewKind("data.json", null, 100)).toBe("text");
  });
  it("skips text previews for files of 1 MB or more", () => {
    expect(previewKind("big.log", "text/plain", 1024 * 1024)).toBe("none");
    expect(previewKind("small.log", "text/plain", 1024 * 1024 - 1)).toBe("text");
  });
  it("falls back to none for unknown types", () => {
    expect(previewKind("archive.zip", "application/zip")).toBe("none");
  });
});

describe("selectRange", () => {
  const rows = ["a", "b", "c", "d", "e"];

  it("selects every row between the anchor and the target", () => {
    const res = selectRange(rows, ["a"], "a", "d", true);
    expect([...res.selected].sort()).toEqual(["a", "b", "c", "d"]);
    expect(res.changed).toEqual(["b", "c", "d"]);
  });
  it("works upwards and orders changes from the anchor outward", () => {
    expect(selectRange(rows, ["e"], "e", "b", true).changed).toEqual(["d", "c", "b"]);
  });
  it("clears the range when the target is being unchecked", () => {
    const res = selectRange(rows, ["a", "b", "c", "d"], "a", "c", false);
    expect(res.selected).toEqual(["d"]);
  });
  it("toggles only the target when the anchor is not on the page", () => {
    const res = selectRange(rows, ["x"], "gone", "c", true);
    expect([...res.selected].sort()).toEqual(["c", "x"]);
    expect(res.changed).toEqual(["c"]);
  });
});

describe("describeKeys", () => {
  it("names a single file or folder", () => {
    expect(describeKeys(["a/b.txt"])).toBe('"b.txt"');
    expect(describeKeys(["a/pics/"])).toBe('the folder "pics" and everything in it');
  });
  it("counts mixed selections", () => {
    expect(describeKeys(["a.txt", "b.txt", "c/"])).toBe(
      "2 files and 1 folder and everything in it"
    );
  });
});
