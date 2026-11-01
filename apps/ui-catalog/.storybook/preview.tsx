import type { Preview } from "@storybook/react-vite";
import { Toaster } from "@metrivum/ui-web";
import "@metrivum/ui-web/styles.css";
import "./preview.css";

const preview: Preview = {
  parameters: {
    layout: "padded",
    backgrounds: { disable: true },
    a11y: { test: "error" },
    controls: { expanded: true },
  },
  globalTypes: {
    locale: {
      description: "Copy language for stories that show EN/PL content",
      toolbar: {
        title: "Locale",
        icon: "globe",
        items: [
          { value: "en", title: "English" },
          { value: "pl", title: "Polski" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { locale: "en" },
  decorators: [
    (Story, context) => (
      <div lang={context.globals.locale as string}>
        <Story />
        <Toaster label="Notifications" dismissLabel="Dismiss" />
      </div>
    ),
  ],
};

export default preview;
