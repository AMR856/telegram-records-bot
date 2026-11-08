import { AppShell } from "@/components/AppShell";
import { ListenerDetail } from "@/components/ListenerDetail";

export default async function ListenerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AppShell>
      <ListenerDetail id={id} />
    </AppShell>
  );
}
