import type { Meta, StoryObj } from "@storybook/react-vite";
import { BACKEND_SERVICES } from "./backend-services.ts";
import { ConnectivityNotice, useConnectivity } from "./offline-banner.tsx";
import { ServiceStatus } from "./service-status.tsx";

/** O host: UMA sondagem (saúde simulada, nada sai da página) para a faixa e para as lâmpadas. */
function Monitor({ failing, pending }: { failing: string[]; pending?: boolean }) {
  const check = (url: string) =>
    pending ? new Promise<boolean>(() => {}) : Promise.resolve(!failing.includes(url));
  const connectivity = useConnectivity(BACKEND_SERVICES, { baseDelayMs: 500, check });
  return (
    <div className="grid w-80 gap-3">
      <ConnectivityNotice {...connectivity} />
      <ServiceStatus services={BACKEND_SERVICES} connectivity={connectivity} />
    </div>
  );
}

const meta = {
  title: "ui/ServiceStatus",
  component: Monitor,
  args: { failing: ["/health/cache"] },
} satisfies Meta<typeof Monitor>;
export default meta;

type Story = StoryObj<typeof meta>;

/** O cache não responde: "Verificando…" na 1ª falha e "Indisponível" na 2ª (cerca de 1 s). */
export const CacheDown: Story = {};

/** Antes da primeira resposta: nada é dado como de pé. */
export const Checking: Story = { args: { pending: true } };
