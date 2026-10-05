import type { Meta, StoryObj } from "@storybook/react-vite";
import { Icon, type IconName, icons } from "./icons.tsx";

const meta = { title: "ui/Icons", component: Icon, args: { name: "agent" } } satisfies Meta<
  typeof Icon
>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Single: Story = {};
export const Catalog: Story = {
  render: () => (
    <ul className="grid grid-cols-5 gap-4 text-xs">
      {(Object.keys(icons) as IconName[]).map((name) => (
        <li key={name} className="flex flex-col items-center gap-1">
          <Icon name={name} size={20} />
          {name}
        </li>
      ))}
    </ul>
  ),
};
