// @vitest-environment jsdom
import { createElement, type ReactNode, type ChangeEvent } from "react";
import type * as TrainingComponents from "./training/components";
import type { ApiRequest } from "@trainflow/api-client-web/transport";
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
    data: {} as unknown,
    profile: { id: "client" },
    get: vi.fn(),
    put: vi.fn(),
    remove: vi.fn(),
    api: vi.fn(),
    mutateAsync: vi.fn(),
    refetch: vi.fn(),
}));
vi.mock("react", () =>
    vi.importActual(`${process.cwd()}/node_modules/react/index.js`),
);
vi.mock("react-native", async () => {
    const { createElement: h } = await import("react");
    return {
        Alert: { alert: vi.fn() },
        AppState: { addEventListener: () => ({ remove() {} }) },
        ActivityIndicator: () => null,
        View: ({ children }: { children?: ReactNode }) =>
            h("div", {}, children),
    };
});
vi.mock("expo-router", () => ({
    router: { push: vi.fn() },
    useLocalSearchParams: () => ({ id: "one" }),
}));
vi.mock("@trainflow/ui-mobile", async () => {
    const { createElement: h } = await import("react");
    const box = ({ children }: { children?: ReactNode }) =>
        h("div", {}, children);
    const input = ({
        label,
        value,
        onChangeText,
        editable,
        disabled,
    }: {
        label: string;
        value: string;
        onChangeText: (value: string) => void;
        editable?: boolean;
        disabled?: boolean;
    }) =>
        h("input", {
            "aria-label": label,
            value,
            disabled: editable === false || disabled,
            onChange: (e: ChangeEvent<HTMLInputElement>) =>
                onChangeText(e.target.value),
        });
    // The screen footer holds the primary actions, so the stand-in renders it too.
    const screenBox = ({
        children,
        footer,
    }: {
        children?: ReactNode;
        footer?: ReactNode;
    }) => h("div", {}, children, footer);
    return {
        Screen: screenBox,
        // A sheet shows its content and footer only while open, as the native one does.
        BottomSheet: ({
            open,
            children,
            footer,
        }: {
            open: boolean;
            children?: ReactNode;
            footer?: ReactNode;
        }) => (open ? h("div", {}, children, footer) : null),
        ActionSheet: () => null,
        Badge: box,
        Chip: box,
        Icon: () => null,
        ProgressBar: () => null,
        SegmentedControl: () => null,
        SelectField: () => null,
        ToolbarSurface: box,
        SearchField: input,
        NumericInput: input,
        IconButton: ({
            label,
            onPress,
            disabled,
        }: {
            label: string;
            onPress: () => void;
            disabled?: boolean;
        }) => h("button", { onClick: onPress, disabled }, label),
        CheckButton: ({
            label,
            onPress,
            disabled,
        }: {
            label: string;
            onPress: () => void;
            disabled?: boolean;
        }) => h("button", { onClick: onPress, disabled }, label),
        // Confirmation sheets are answered "yes": these tests cover what happens after.
        confirm: vi.fn(async () => true),
        haptic: {
            selection() {},
            success() {},
            warning() {},
            confirm() {},
        },
        useTheme: () => ({
            spacing: { xs: 4, sm: 8, md: 16, lg: 24 },
            icon: { sm: 18, md: 22 },
            radii: {},
            hairline: 1,
            colors: {},
        }),
        Text: box,
        Heading: box,
        Section: box,
        LoadingState: () => h("div", {}, "Loading"),
        EmptyState: box,
        ErrorState: ({ error }: { error: unknown }) =>
            h("div", {}, String(error)),
        ListItem: ({ title, subtitle }: { title: string; subtitle?: string }) =>
            h("div", {}, title, subtitle),
        Button: ({
            title,
            onPress,
            disabled,
            loading,
        }: {
            title: string;
            onPress: () => void;
            disabled?: boolean;
            loading?: boolean;
        }) =>
            h(
                "button",
                { onClick: onPress, disabled: disabled || loading },
                title,
            ),
        Field: ({
            label,
            value,
            onChangeText,
            editable,
        }: {
            label: string;
            value: string;
            onChangeText: (value: string) => void;
            editable?: boolean;
        }) =>
            h("input", {
                "aria-label": label,
                value,
                disabled: editable === false,
                onChange: (e: ChangeEvent<HTMLInputElement>) =>
                    onChangeText(e.target.value),
            }),
    };
});
vi.mock("./training/NativeDateField", () => ({ NativeDateField: () => null }));
vi.mock("expo-router/react-navigation", () => ({
    useNavigation: vi.fn(),
    usePreventRemove: vi.fn(),
}));
vi.mock("./training/components", async () => ({
    ...(await vi.importActual<typeof TrainingComponents>(
        "./training/components",
    )),
    Choices: () => null,
    Pagination: () => null,
    useDraftExitGuard: vi.fn(),
}));
vi.mock("../infrastructure/session/MobileSession", () => {
    const drafts = { get: mocks.get, put: mocks.put, remove: mocks.remove };
    return {
        useMobile: () => ({ profile: mocks.profile, api: mocks.api, drafts }),
    };
});
vi.mock("../infrastructure/networking/queries", () => ({
    useApiQuery: () => ({ data: mocks.data, refetch: mocks.refetch }),
    useApiMutation: () => ({
        mutateAsync: mocks.mutateAsync,
        mutate: mocks.mutateAsync,
        isPending: false,
    }),
}));
import { CheckInScreen } from "./check-ins";
import { WorkoutScreen } from "./training/WorkoutScreen";
import { useDraftExitGuard } from "./training/components";
const draft = {
    performedDate: "2026-10-10",
    durationSeconds: null,
    comment: "initial",
    exercises: [],
};
function checkIn(version = 1) {
    return {
        request: {
            id: "one",
            version,
            formVersionId: "form",
            status: "Available",
            dueAtUtc: "2026-10-10",
            clientReply: null,
        },
        form: {
            coachId: "coach",
            definition: {
                sections: [
                    {
                        key: "s",
                        order: 0,
                        questions: [
                            {
                                key: "q",
                                label: "Answer",
                                type: "ShortText",
                                order: 0,
                            },
                        ],
                    },
                ],
            },
        },
    };
}
function workout(version = 1) {
    return {
        occurrence: { id: "one", relationshipId: "r" },
        execution: {
            id: "e",
            version,
            allowedActions: ["save"],
            status: "InProgress",
            exercises: [],
            performedDate: draft.performedDate,
            comment: "",
        },
        prescription: {
            workout: { exercises: [], groups: [] },
            exercises: {},
            formulas: {},
        },
    };
}
function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => {
        resolve = r;
    });
    return { promise, resolve };
}
beforeEach(() => {
    vi.clearAllMocks();
    mocks.profile.id = "client";
    mocks.get.mockResolvedValue(undefined);
    mocks.put.mockResolvedValue(undefined);
    mocks.remove.mockResolvedValue(undefined);
    mocks.api.mockImplementation(async (r: ApiRequest) => ({
        data: { version: Number(r.ifMatch ?? 0) + 1 },
        version: Number(r.ifMatch ?? 0) + 1,
    }));
    mocks.mutateAsync.mockResolvedValue({});
});
afterEach(cleanup);
it("locks check-in editing and duplicate submission while a local write is pending", async () => {
    const write = deferred();
    const submit = deferred();
    mocks.put.mockReturnValue(write.promise);
    mocks.mutateAsync.mockReturnValue(submit.promise);
    mocks.data = checkIn();
    render(createElement(CheckInScreen));
    await screen.findByLabelText("Answer");
    fireEvent.change(screen.getByLabelText("Answer"), {
        target: { value: "retained" },
    });
    fireEvent.click(screen.getByText("Send check-in"));
    fireEvent.click(screen.getByText("Send check-in"));
    expect((screen.getByLabelText("Answer") as HTMLInputElement).disabled).toBe(
        true,
    );
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
    await act(async () => {
        write.resolve();
    });
    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(1));
    expect(mocks.mutateAsync.mock.calls[0]![0].json).toEqual({
        answers: { q: "retained" },
    });
    await act(async () => {
        submit.resolve();
    });
    expect(mocks.remove).toHaveBeenCalledTimes(1);
});
it("persists explicit check-in conflict acceptance and keeps edits across polling", async () => {
    mocks.get.mockResolvedValue({
        version: 1,
        value: { answers: { q: "local" }, reply: "", notes: "" },
    });
    mocks.data = checkIn(2);
    const view = render(createElement(CheckInScreen));
    await screen.findByLabelText("Answer");
    expect(
        (screen.getByText("Send check-in") as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(
        screen.getByText("Keep my answers and continue"),
    );
    await waitFor(() =>
        expect(mocks.put).toHaveBeenCalledWith(
            "check-in:one:form",
            { answers: { q: "local" }, reply: "", notes: "" },
            2,
        ),
    );
    mocks.data = checkIn(3);
    view.rerender(createElement(CheckInScreen));
    expect((screen.getByLabelText("Answer") as HTMLInputElement).value).toBe(
        "local",
    );
    expect(mocks.get).toHaveBeenCalledTimes(1);
});
it("does not let an older workout local write clear the newer unsaved indicator, or finish before all writes", async () => {
    mocks.data = workout();
    mocks.get.mockResolvedValue({ version: 1, value: draft });
    const first = deferred();
    const second = deferred();
    let writes = 0;
    let localTail = Promise.resolve();
    mocks.put.mockImplementation(() => {
        const gate =
            writes++ === 0
                ? first.promise
                : writes === 2
                  ? second.promise
                  : Promise.resolve();
        localTail = localTail.then(() => gate);
        return localTail;
    });
    render(createElement(WorkoutScreen));
    await screen.findByLabelText("Session note");
    fireEvent.change(screen.getByLabelText("Session note"), {
        target: { value: "first" },
    });
    fireEvent.change(screen.getByLabelText("Session note"), {
        target: { value: "latest" },
    });
    await act(async () => {
        first.resolve();
    });
    expect(screen.queryByText("Saved on this phone")).toBeNull();
    expect(useDraftExitGuard).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByText("Finish workout"));
    fireEvent.click(screen.getByText("Finish workout"));
    expect(
        mocks.api.mock.calls.some(([r]) => r.path.endsWith("/complete")),
    ).toBe(false);
    await act(async () => {
        second.resolve();
    });
    await waitFor(() =>
        expect(
            mocks.api.mock.calls.filter(([r]) => r.path.endsWith("/complete")),
        ).toHaveLength(1),
    );
    const calls = mocks.api.mock.calls.map(([r]) => r);
    expect(calls.at(-2).json.comment).toBe("latest");
    expect(calls.at(-1).ifMatch).toBe(calls.at(-2).ifMatch + 1);
});
it("does not reload a workout draft or replace its queue on background refetch", async () => {
    mocks.data = workout();
    mocks.get.mockResolvedValue({ version: 1, value: draft });
    const view = render(createElement(WorkoutScreen));
    await screen.findByLabelText("Session note");
    fireEvent.change(screen.getByLabelText("Session note"), {
        target: { value: "latest" },
    });
    await waitFor(() => expect(mocks.api).toHaveBeenCalled());
    mocks.data = workout(2);
    view.rerender(createElement(WorkoutScreen));
    expect(
        (screen.getByLabelText("Session note") as HTMLInputElement).value,
    ).toBe("latest");
    expect(mocks.get).toHaveBeenCalledTimes(1);
});

it("retains coach reply and private notes after local failure and only submits after a durable retry", async () => {
    mocks.profile.id = "coach";
    mocks.data = {
        ...checkIn(),
        request: { ...checkIn().request, status: "Submitted" },
        submission: { answers: { q: "client answer" } },
    };
    mocks.put.mockRejectedValueOnce(Error("Disk unavailable"));
    render(createElement(CheckInScreen));
    await screen.findByLabelText("Reply to the client");
    fireEvent.change(screen.getByLabelText("Reply to the client"), {
        target: { value: "For client" },
    });
    await screen.findByText("Local save failed");
    fireEvent.click(screen.getByText("Mark as reviewed"));
    await waitFor(() =>
        expect(
            (screen.getByText("Mark as reviewed") as HTMLButtonElement)
                .disabled,
        ).toBe(false),
    );
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Private notes"), {
        target: { value: "Private" },
    });
    await screen.findByText("Saved locally");
    fireEvent.click(screen.getByText("Mark as reviewed"));
    await waitFor(() =>
        expect(mocks.mutateAsync).toHaveBeenCalledWith(
            expect.objectContaining({
                ifMatch: 1,
                json: {
                    clientReply: "For client",
                    coachPrivateNotes: "Private",
                },
            }),
        ),
    );
});
it("retains a failed workout draft and never completes after a version conflict", async () => {
    mocks.data = workout();
    mocks.get.mockResolvedValue({ version: 1, value: draft });
    mocks.api.mockRejectedValue(Error("Version conflict"));
    render(createElement(WorkoutScreen));
    await screen.findByLabelText("Session note");
    fireEvent.change(screen.getByLabelText("Session note"), {
        target: { value: "retained" },
    });
    await screen.findByText("Error: Version conflict");
    fireEvent.click(screen.getByText("Finish workout"));
    await waitFor(() =>
        expect(
            (screen.getByText("Finish workout") as HTMLButtonElement).disabled,
        ).toBe(false),
    );
    expect(
        mocks.api.mock.calls.some(([r]) => r.path.endsWith("/complete")),
    ).toBe(false);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.put).toHaveBeenLastCalledWith(
        "workout:e",
        expect.objectContaining({ comment: "retained" }),
        1,
    );
});

it("registers every check-in edit with account storage before a switch can close it", async () => {
    mocks.data = checkIn();
    const write = deferred();
    mocks.put.mockReturnValue(write.promise);
    render(createElement(CheckInScreen));
    await screen.findByLabelText("Answer");
    fireEvent.change(screen.getByLabelText("Answer"), {
        target: { value: "first" },
    });
    fireEvent.change(screen.getByLabelText("Answer"), {
        target: { value: "latest" },
    });
    expect(mocks.put).toHaveBeenCalledTimes(2);
    await act(async () => {
        write.resolve();
    });
});
it("blocks check-in submission while a number contains invalid visible text", async () => {
    const data = checkIn();
    data.form.definition.sections[0]!.questions[0]!.type = "Number";
    mocks.data = data;
    render(createElement(CheckInScreen));
    await screen.findByLabelText("Answer");
    fireEvent.change(screen.getByLabelText("Answer"), {
        target: { value: "80" },
    });
    fireEvent.change(screen.getByLabelText("Answer"), {
        target: { value: "80..5" },
    });
    fireEvent.click(screen.getByText("Send check-in"));
    expect(
        (screen.getByText("Send check-in") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Answer"), {
        target: { value: "80.5" },
    });
    fireEvent.click(screen.getByText("Send check-in"));
    await waitFor(() =>
        expect(mocks.mutateAsync).toHaveBeenCalledWith(
            expect.objectContaining({ json: { answers: { q: 80.5 } } }),
        ),
    );
});

it("blocks workout completion while the displayed duration is malformed", async () => {
    mocks.data = workout();
    mocks.get.mockResolvedValue({ version: 1, value: draft });
    render(createElement(WorkoutScreen));
    await screen.findByLabelText("Duration (minutes)");
    fireEvent.change(screen.getByLabelText("Duration (minutes)"), {
        target: { value: "80" },
    });
    fireEvent.change(screen.getByLabelText("Duration (minutes)"), {
        target: { value: "80..5" },
    });
    fireEvent.click(screen.getByText("Finish workout"));
    expect(
        (screen.getByText("Finish workout") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
        mocks.api.mock.calls.some(([r]) => r.path.endsWith("/complete")),
    ).toBe(false);
    fireEvent.change(screen.getByLabelText("Duration (minutes)"), {
        target: { value: "80.5" },
    });
    fireEvent.click(screen.getByText("Finish workout"));
    await waitFor(() =>
        expect(
            mocks.api.mock.calls.filter(([r]) => r.path.endsWith("/complete")),
        ).toHaveLength(1),
    );
    const calls = mocks.api.mock.calls.map(([r]) => r);
    // The field is in minutes; the API still receives seconds.
    expect(calls.at(-2).json.durationSeconds).toBe(4830);
});
it("keeps displayed numeric values aligned with the remaining set after deleting an extra set", async () => {
    mocks.data = workout();
    mocks.get.mockResolvedValue({
        version: 1,
        value: {
            ...draft,
            exercises: [
                {
                    exerciseId: "exercise",
                    prescribedInstanceId: null,
                    comment: "",
                    sets: [
                        {
                            reps: 5,
                            skipped: false,
                            loadMeaning: "TotalExternal",
                        },
                        {
                            reps: 12,
                            skipped: false,
                            loadMeaning: "TotalExternal",
                        },
                    ],
                },
            ],
        },
    });
    render(createElement(WorkoutScreen));
    await screen.findAllByLabelText("Reps");
    // Removing an extra set lives in the details sheet of that set.
    fireEvent.click(screen.getAllByText("Details")[0]!);
    fireEvent.click(screen.getByText("Remove this extra set"));
    expect((screen.getByLabelText("Reps") as HTMLInputElement).value).toBe(
        "12",
    );
});
