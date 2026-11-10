import type { SVGProps } from "react";

/** Menu icons supplied with the design (Tabler outline set, 24px grid, 1.5 stroke). */
export type NavIcon = (
  props: SVGProps<SVGSVGElement> & { strokeWidth?: number },
) => React.JSX.Element;

function icon(paths: string[]): NavIcon {
  return function Icon({ strokeWidth = 1.5, ...props }) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
      >
        {paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    );
  };
}

export const DashboardIcon = icon([
  "M4 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4",
  "M14 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4",
  "M4 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4",
  "M14 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4",
]);

export const ProgramsIcon = icon([
  "M3 17a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2l0 -2",
  "M15 17a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2l0 -2",
  "M9 5a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2l0 -2",
  "M6 15v-1a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v1",
  "M12 9l0 3",
]);

export const TemplatesIcon = icon([
  "M12 4l-8 4l8 4l8 -4l-8 -4",
  "M4 12l8 4l8 -4",
  "M4 16l8 4l8 -4",
]);

export const FormulasIcon = icon([
  "M18 16v2a1 1 0 0 1 -1 1h-11l6 -7l-6 -7h11a1 1 0 0 1 1 1v2",
]);

export const ExercisesIcon = icon([
  "M7 20l10 0",
  "M6 6l6 -1l6 1",
  "M12 3l0 17",
  "M9 12l-3 -6l-3 6a3 3 0 0 0 6 0",
  "M21 12l-3 -6l-3 6a3 3 0 0 0 6 0",
]);

export const VideoAnalysesIcon = icon([
  "M15 10l4.553 -2.276a1 1 0 0 1 1.447 .894v6.764a1 1 0 0 1 -1.447 .894l-4.553 -2.276v-4",
  "M3 8a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2l0 -8",
]);

export const SettingsIcon = icon([
  "M19.875 6.27a2.225 2.225 0 0 1 1.125 1.948v7.284c0 .809 -.443 1.555 -1.158 1.948l-6.75 4.27a2.269 2.269 0 0 1 -2.184 0l-6.75 -4.27a2.225 2.225 0 0 1 -1.158 -1.948v-7.285c0 -.809 .443 -1.554 1.158 -1.947l6.75 -3.98a2.33 2.33 0 0 1 2.25 0l6.75 3.98h-.033",
  "M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
]);

export const MessagesIcon = icon([
  "M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z",
]);

export const ClientsIcon = icon([
  "M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0",
  "M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2",
  "M16 3.13a4 4 0 0 1 0 7.75",
  "M21 21v-2a4 4 0 0 0 -3 -3.85",
]);

export const FormsIcon = icon([
  "M9 11l3 3l8 -8",
  "M20 12v6a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h9",
]);

export const OffersIcon = icon([
  "M9 15l6 -6",
  "M9 9.5a.5 .5 0 1 0 1 0a.5 .5 0 1 0 -1 0",
  "M14 14.5a.5 .5 0 1 0 1 0a.5 .5 0 1 0 -1 0",
  "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0",
]);

export const CalendarIcon = icon([
  "M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12",
  "M16 3l0 4",
  "M8 3l0 4",
  "M4 11l16 0",
  "M8 15h2v2h-2l0 -2",
]);

export const EarningsIcon = icon([
  "M17 8v-3a1 1 0 0 0 -1 -1h-10a2 2 0 0 0 0 4h12a1 1 0 0 1 1 1v3m0 4v3a1 1 0 0 1 -1 1h-12a2 2 0 0 1 -2 -2v-12",
  "M20 12v4h-4a2 2 0 0 1 0 -4h4",
]);

export const AnalyzeIcon = icon([
  "M10 10.105a1.105 1.105 0 0 1 1.105 -1.105h1.79a1.105 1.105 0 0 1 1.105 1.105v9.79a1.105 1.105 0 0 1 -1.105 1.105h-1.79a1.105 1.105 0 0 1 -1.105 -1.105l0 -9.79",
  "M17 4.105a1.105 1.105 0 0 1 1.105 -1.105h1.79a1.105 1.105 0 0 1 1.105 1.105v15.79a1.105 1.105 0 0 1 -1.105 1.105h-1.79a1.105 1.105 0 0 1 -1.105 -1.105l0 -15.79",
  "M3 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
]);

/* Client menu icons supplied with the design (Tabler outline). */
export const InvitationsIcon = icon([
  "M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10",
  "M3 7l9 6l9 -6",
]);

export const CheckInsIcon = icon([
  "M12 4l-8 4l8 4l8 -4l-8 -4",
  "M4 12l8 4l8 -4",
  "M4 16l8 4l8 -4",
]);

export const PaymentsIcon = icon([
  "M2 4h9.914a3 3 0 0 1 1.92 .695l5.166 4.305",
  "M11.15 9h8.85a2 2 0 0 1 2 2v7a2 2 0 0 1 -2 2h-13a2 2 0 0 1 -2 -2v-8.7",
  "M3 8l7.2 4.7a1.803 1.803 0 0 0 2 -3l-4.2 -2.7",
  "M5 16h17",
]);

export const DocumentsIcon = icon([
  "M14 3v4a1 1 0 0 0 1 1h4",
  "M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2",
]);

export const AnatomyIcon = icon([
  "M10 4a2 2 0 1 0 4 0a2 2 0 0 0 -4 0",
  "M5 9l5 1v4l-3 7m12 -12l-5 1v4l3 7m-7 -11h4",
]);
