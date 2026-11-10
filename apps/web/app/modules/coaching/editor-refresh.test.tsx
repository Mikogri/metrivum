import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EditableResource } from "./components";

type Resource = { id: string; version: number; name: string };
function Editor({
  value,
  dirty,
}: {
  value: Resource;
  dirty: (value: boolean) => void;
}) {
  const [text, setText] = useState(value.name);
  return (
    <input
      aria-label="Draft"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        dirty(true);
      }}
    />
  );
}
function Page({ value }: { value: Resource }) {
  return (
    <EditableResource value={value}>
      {(snapshot, dirty) => (
        <Editor
          key={`${snapshot.id}:${snapshot.version}`}
          value={snapshot}
          dirty={dirty}
        />
      )}
    </EditableResource>
  );
}
describe("Editor refresh", () => {
  it("refreshes a clean editor after a worker advances the resource version", () => {
    const view = render(
      <Page value={{ id: "schedule", version: 1, name: "Before" }} />,
    );
    view.rerender(
      <Page value={{ id: "schedule", version: 2, name: "After" }} />,
    );
    expect(screen.getByLabelText("Draft")).toHaveValue("After");
  });
  it("preserves unsaved changes when a newer version arrives", () => {
    const view = render(
      <Page value={{ id: "schedule", version: 1, name: "Before" }} />,
    );
    fireEvent.change(screen.getByLabelText("Draft"), {
      target: { value: "Unsaved" },
    });
    view.rerender(
      <Page value={{ id: "schedule", version: 2, name: "Other editor" }} />,
    );
    expect(screen.getByLabelText("Draft")).toHaveValue("Unsaved");
  });
  it("resets editor state after confirmed navigation to a different resource", () => {
    const view = render(
      <Page value={{ id: "first", version: 1, name: "First" }} />,
    );
    fireEvent.change(screen.getByLabelText("Draft"), {
      target: { value: "Unsaved" },
    });
    view.rerender(
      <Page value={{ id: "second", version: 1, name: "Second" }} />,
    );
    expect(screen.getByLabelText("Draft")).toHaveValue("Second");
  });
});
