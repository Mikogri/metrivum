import { describe, expect, it } from "vitest";
import { appRoutes } from "./warmRoutes";

describe("appRoutes", () => {
  const route = (id: string, parentId?: string, path?: string) => ({ id, parentId, path, module: `/${id}.js` });
  const routes = Object.fromEntries(
    [
      route("root"),
      route("public", "root"),
      route("home", "public", ""),
      route("private", "root"),
      route("login", "private", "auth/login"),
      route("app", "private", "app"),
      route("offers", "app", "offers"),
      route("offer", "app", "offers/:offerId"),
    ].map((item) => [item.id, item]),
  );

  it("lists only the pages below the /app layout", () => {
    expect(appRoutes(routes).map((item) => item.id)).toEqual(["offers", "offer"]);
  });

  it("lists nothing when there is no /app layout", () => {
    expect(appRoutes({ root: route("root") })).toEqual([]);
  });
});
