import type { Meta, StoryObj } from "@storybook/react-vite";
import { Icon } from "../icons.tsx";
import { Button } from "./button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "./dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu.tsx";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip.tsx";

const meta = { title: "ui/Overlays" } satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const DialogStory: Story = {
  name: "Dialog",
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Novo agente</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Criar agente</DialogTitle>
        <DialogDescription>Defina nome e modelo.</DialogDescription>
      </DialogContent>
    </Dialog>
  ),
};

export const DropdownMenuStory: Story = {
  name: "DropdownMenu",
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="icon" aria-label="Mais ações">
          <Icon name="more" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Agente</DropdownMenuLabel>
        <DropdownMenuItem>
          <Icon name="copy" /> Duplicar
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Icon name="delete" /> Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

export const TooltipStory: Story = {
  name: "Tooltip",
  render: () => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Custo">
            <Icon name="cost" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Custo acumulado no OpenRouter</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
};
