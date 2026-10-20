import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../components/ui/button.tsx";
import { CompletionSoundToggle, LONG_MS, useCompletionSound } from "./completion-sound.tsx";

/** Ligue o som e simule o fim de uma resposta longa (o painel chama `notify` com a duração). */
function Demo() {
  const sound = useCompletionSound();
  return (
    <div className="grid gap-3">
      <CompletionSoundToggle sound={sound} />
      <Button variant="secondary" size="sm" onClick={() => sound.notify(LONG_MS + 2_000)}>
        Simular resposta longa
      </Button>
    </div>
  );
}

const meta = { title: "Chat/CompletionSound", component: Demo } satisfies Meta<typeof Demo>;
export default meta;

export const Toggle: StoryObj<typeof meta> = {};
