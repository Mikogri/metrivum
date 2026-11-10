import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useApi, useAccountKey } from "~/shared/session/AccountScope";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import type { Page } from "~/modules/coaching";

export interface CalendarEvent {
  id: string;
  coachId: string;
  organizerName: string;
  kind: "Meeting" | "Event";
  title: string;
  description: string;
  timeZone: string;
  startsAtUtc: string;
  endsAtUtc: string;
  startDate: string | null;
  endDateExclusive: string | null;
  location: string | null;
  meetingUrl: string | null;
  cancelled: boolean;
  version: number;
  response: string | null;
  responseVersion: number | null;
  attendees:
    | {
        relationshipId: string;
        clientId: string;
        response: string;
        version: number;
      }[]
    | null;
}
export interface CalendarCheckIn {
  id: string;
  kind: "Request" | "Planned";
  scheduleId: string;
  requestId: string | null;
  name: string;
  availableAtUtc: string;
  dueAtUtc: string;
  status: string;
}

export function useCalendarRange<T>(
  path: string,
  range: { from: string; to: string },
  timeZone: string,
  kind?: string,
) {
  const api = useApi();
  const account = useAccountKey();
  const { mode } = useWorkspace();
  // Switching the view or period keeps the previous entries on screen until the new ones arrive.
  return useQuery({
    queryKey: [account, "coaching", mode, path, range, timeZone, kind],
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const items: T[] = [];
      let page = 1;
      while (true) {
        const result = (
          await api<Page<T>>({
            path,
            query: {
              ...range,
              timeZone,
              role: mode,
              kind,
              page,
              pageSize: 100,
            },
            signal,
          })
        ).data;
        items.push(...result.items);
        if (items.length >= result.total || !result.items.length) return items;
        page++;
      }
    },
  });
}

/** A client's scheduled workout, as the training schedule lists it. */
export interface CalendarWorkout {
  id: string;
  name: string;
  programName: string;
  scheduledDate: string;
  status: string;
}

/** The client's own workouts for the visible dates (the schedule works in plain dates). */
export function useCalendarWorkouts(
  range: { from: string; to: string },
  enabled: boolean,
) {
  const api = useApi();
  const account = useAccountKey();
  return useQuery({
    queryKey: [account, "coaching", "client", "calendar-workouts", range],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const items: CalendarWorkout[] = [];
      let page = 1;
      while (true) {
        const result = (
          await api<Page<CalendarWorkout>>({
            path: "/api/v1/training/schedule",
            query: { ...range, view: "client", page, pageSize: 100 },
            signal,
          })
        ).data;
        items.push(...result.items);
        if (items.length >= result.total || !result.items.length || page >= 20)
          return items;
        page++;
      }
    },
  });
}
