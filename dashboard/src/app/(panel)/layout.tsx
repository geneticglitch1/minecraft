import { Shell } from "@/components/shell";
import { ManagedNotice } from "@/components/managed-notice";

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return <Shell><ManagedNotice />{children}</Shell>;
}
