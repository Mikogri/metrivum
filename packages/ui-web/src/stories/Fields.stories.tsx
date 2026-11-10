import type { Meta, StoryObj } from "@storybook/react-vite";
import { parseDate } from "@internationalized/date";
import { I18nProvider } from "react-aria-components";
import {
  Checkbox,
  Chip,
  ChipGroup,
  Combobox,
  DateField,
  NumberInput,
  Option,
  Radio,
  RadioGroup,
  SearchInput,
  Segment,
  SegmentedControl,
  Select,
  Switch,
  TextArea,
  TextField,
} from "../index";
import { pick } from "./copy";

const meta = { title: "Forms/Fields" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Text: Story = {
  render: (_, { globals }) => {
    const t = pick(globals.locale);
    return (
      <div style={{ display: "grid", gap: 16, maxWidth: 360 }}>
        <TextField
          label={t.name}
          description={t.nameHint}
          defaultValue="Strength block A"
        />
        <TextField
          label={t.name}
          isRequired
          isInvalid
          errorMessage={t.required}
        />
        <TextField label={t.name} isDisabled defaultValue="Archived" />
        <TextField label={t.longLabel} defaultValue={t.longLabel} />
        <TextArea label="Notes" defaultValue="Keep the bar path vertical." />
        <SearchInput aria-label={t.search} placeholder={t.search} />
      </div>
    );
  },
};

export const Numbers: Story = {
  name: "Number (locale aware)",
  render: (_, { globals }) => {
    const t = pick(globals.locale);
    const locale = globals.locale === "pl" ? "pl-PL" : "en-GB";
    return (
      <I18nProvider locale={locale}>
        <div style={{ display: "grid", gap: 16, maxWidth: 260 }}>
          <NumberInput
            label={t.load}
            unit="kg"
            defaultValue={82.5}
            showSteppers
            step={2.5}
          />
          <NumberInput
            label="RPE"
            minValue={0}
            maxValue={10}
            step={0.5}
            defaultValue={8}
            isInvalid
            errorMessage="0–10"
          />
          <DateField
            label="Date of birth"
            defaultValue={parseDate("1990-01-01")}
          />
        </div>
      </I18nProvider>
    );
  },
};

export const Choice: Story = {
  render: (_, { globals }) => {
    const t = pick(globals.locale);
    return (
      <div style={{ display: "grid", gap: 16, maxWidth: 320 }}>
        <Select label={t.kind} defaultSelectedKey="std">
          <Option id="std">{t.standard}</Option>
          <Option id="top">{t.topSet}</Option>
          <Option id="ramp" description="2–20 segments">
            {t.ramp}
          </Option>
        </Select>
        <Combobox
          label="Time zone"
          defaultItems={[
            { id: "Europe/Warsaw" },
            { id: "Europe/London" },
            { id: "America/New_York" },
          ]}
        >
          {(item: { id: string }) => <Option id={item.id}>{item.id}</Option>}
        </Combobox>
        <Checkbox>{t.accept}</Checkbox>
        <Checkbox isInvalid>{t.accept}</Checkbox>
        <Switch defaultSelected>{t.notify}</Switch>
        <Switch isDisabled>{t.notify}</Switch>
        <RadioGroup label="Format" defaultValue="pdf" orientation="horizontal">
          <Radio value="pdf">PDF</Radio>
          <Radio value="csv">CSV</Radio>
        </RadioGroup>
        <SegmentedControl
          aria-label="Cycle length"
          defaultSelectedKeys={["10"]}
        >
          <Segment id="7">7</Segment>
          <Segment id="9">9</Segment>
          <Segment id="10">10</Segment>
        </SegmentedControl>
        <ChipGroup aria-label="Lift" defaultSelectedKeys={["squat"]}>
          <Chip id="squat">Squat</Chip>
          <Chip id="bench">Bench press</Chip>
          <Chip id="deadlift">Deadlift</Chip>
        </ChipGroup>
      </div>
    );
  },
};
