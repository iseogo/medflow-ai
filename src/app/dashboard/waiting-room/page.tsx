import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/dashboard/Header";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { WaitingRoomBoard } from "@/components/dashboard/WaitingRoomBoard";
import { authOptions } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { physicalClientService } from "@/services/physical-client.service";

export default async function WaitingRoomPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.role || !hasPermission(session.user.role, "checkins:read")) {
    redirect("/dashboard/access-denied");
  }

  const queue = await physicalClientService.listWaitingRoom(true);

  const serialized = queue.map((e) => ({
    id: e.id,
    state: e.state,
    queuePosition: e.queuePosition,
    arrivedAt: e.arrivedAt.toISOString(),
    waitDurationMinutes: e.waitDurationMinutes,
    client: e.client,
    appointment: e.appointment,
  }));

  return (
    <>
      <Header title="Waiting room" />
      <section className="flex-1 overflow-auto p-8">
        <PageHeader
          title="Waiting room"
          description="Live queue — track arrival, wait time, and visit progress"
        />
        <WaitingRoomBoard initialQueue={serialized} />
      </section>
    </>
  );
}
