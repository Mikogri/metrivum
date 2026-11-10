import { describe, expect, it } from "vitest";
import { ACCEPTED_TYPES, videoContentType } from "./upload";

describe("video upload types", () => {
  it.each(["", "application/octet-stream", "video/quicktime"])(
    "accepts MOV with MIME %s",
    (type) => {
      expect(videoContentType({ name: "Lift.MOV", type })).toBe(
        "video/quicktime",
      );
      expect(ACCEPTED_TYPES).toContain(
        videoContentType({ name: "Lift.MOV", type }),
      );
    },
  );
  it("does not override an incompatible declared MIME type", () => {
    expect(ACCEPTED_TYPES).not.toContain(
      videoContentType({ name: "fake.mov", type: "text/plain" }),
    );
  });
});
