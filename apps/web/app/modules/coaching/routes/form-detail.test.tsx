import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import FormDetail from "./form-detail";
const state = vi.hoisted(() => ({
  data: undefined as unknown,
  mutate: vi.fn(),
}));
vi.mock("../api", () => ({
  useCoachingQuery: () => ({
    data: state.data,
    isPending: false,
    isError: false,
  }),
  useCoachingMutation: () => ({ mutate: state.mutate, isPending: false }),
}));
vi.mock("~/shared/session/dirty-guard", () => ({
  useUnsavedWorkGuard: () => undefined,
}));
vi.mock("../components", () => ({
  DraftNavigationGuard: () => null,
  MutationError: () => null,
  Failure: () => null,
  Loading: () => null,
  EditableResource: ({
    value,
    children,
  }: {
    value: unknown;
    children: (value: unknown) => React.ReactNode;
  }) => children(value),
}));
beforeEach(() => {
  state.data = undefined;
  state.mutate.mockClear();
});
function open(path = "/app/forms/new") {
  render(
    <RouterProvider
      router={createMemoryRouter(
        [
          { path: "/app/forms/new", element: <FormDetail /> },
          { path: "/app/forms/:formId", element: <FormDetail /> },
        ],
        { initialEntries: [path] },
      )}
    />,
  );
}
it("starts empty and adds questions only on request, with edit/delete in the menu", async () => {
  const user = userEvent.setup();
  open();
  expect(screen.getByRole("textbox", { name: "Form name" })).toHaveValue("");
  expect(
    screen.queryByRole("textbox", { name: "Question 1" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("textbox", { name: "Section 1 title" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Add section" }));
  expect(screen.getByRole("textbox", { name: "Section 1 title" })).toHaveValue(
    "",
  );
  await user.click(screen.getByRole("button", { name: "Short text" }));
  await user.click(screen.getByRole("button", { name: "Question 1 actions" }));
  await user.click(screen.getByRole("menuitem", { name: "Edit question" }));
  await user.type(
    screen.getByRole("textbox", { name: "Question 1" }),
    "Your goal?",
  );
  expect(screen.getByRole("textbox", { name: "Question 1" })).toHaveValue(
    "Your goal?",
  );
  await user.click(screen.getByRole("button", { name: "Question 1 actions" }));
  await user.click(screen.getByRole("menuitem", { name: "Delete question" }));
  expect(
    screen.queryByRole("textbox", { name: "Question 1" }),
  ).not.toBeInTheDocument();
});
it("restores an archived form through its existing versioned endpoint", async () => {
  state.data = {
    id: "archived",
    version: 4,
    archived: true,
    name: "Old form",
    description: "",
    purpose: "Application",
    draft: { sections: [] },
  };
  open("/app/forms/archived");
  await userEvent.click(screen.getByRole("button", { name: "Restore" }));
  expect(state.mutate).toHaveBeenCalledWith({
    method: "POST",
    path: "/api/v1/forms/archived/restore",
    ifMatch: 4,
  });
});
