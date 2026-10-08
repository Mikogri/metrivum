import type { Meta, StoryObj } from "@storybook/react-vite";
import { Dumbbell, Heart, Video } from "lucide-react";
import { Breadcrumbs, Button, Card, List, ListRow, PageHeader, Pagination, SectionHeader, Separator, Tab, TabList, TabPanel, Tabs } from "../index";
import { pick } from "./copy";

const meta = { title: "Navigation & structure" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const TabsUnderline: Story = {
  render: () => (
    <Tabs>
      <TabList aria-label="Analyses">
        <Tab id="a" icon={<Video />}>
          Analyses
        </Tab>
        <Tab id="b" icon={<Heart />} count={2}>
          Favourites
        </Tab>
        <Tab id="c" icon={<Dumbbell />}>
          Exercises
        </Tab>
      </TabList>
      <TabPanel id="a">Analyses panel</TabPanel>
      <TabPanel id="b">Favourites panel</TabPanel>
      <TabPanel id="c">Exercises panel</TabPanel>
    </Tabs>
  ),
};

export const TabsPill: Story = {
  render: () => (
    <Tabs variant="pill">
      <TabList aria-label="Notifications">
        <Tab id="general">General</Tab>
        <Tab id="mentions">Mentions</Tab>
        <Tab id="archive">Archive</Tab>
      </TabList>
      <TabPanel id="general">General</TabPanel>
      <TabPanel id="mentions">Mentions</TabPanel>
      <TabPanel id="archive">Archive</TabPanel>
    </Tabs>
  ),
};

export const Headers: Story = {
  render: (_, { globals }) => {
    const t = pick(globals.locale);
    return (
      <div style={{ display: "grid", gap: 16 }}>
        <PageHeader
          context={<Breadcrumbs items={[{ id: "1", label: "Programs", href: "#" }, { id: "2", label: "Off-season", href: "#" }, { id: "3", label: "Strength block A" }]} />}
          title="Strength block A"
          description={t.nameHint}
          actions={<Button variant="primary">{t.publish}</Button>}
        />
        <Card padding="lg">
          <SectionHeader title="Recent programs" description="Updated in the last week" />
          <Separator />
        </Card>
      </div>
    );
  },
};

export const Lists: Story = {
  render: (_, { globals }) => {
    const t = pick(globals.locale);
    return (
      <div style={{ maxWidth: 640 }}>
        <List>
          <ListRow title={<a href="#a" data-row-link>Romanian deadlift</a>} subtitle="Hinge · Hamstrings" columns={<span>2 days ago</span>} />
          <ListRow title="Bulgarian split squat" subtitle="Squat · Quadriceps" columns={<span>1 week ago</span>} />
        </List>
        <Pagination page={2} pageCount={5} onPageChange={() => {}} labels={{ previous: t.previous, next: t.next, status: t.page, navigation: "Pagination" }} />
      </div>
    );
  },
};
