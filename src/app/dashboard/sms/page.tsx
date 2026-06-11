import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/dashboard/Header";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SmsInbox } from "@/components/dashboard/SmsInbox";
import { authOptions } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { smsConversationService } from "@/services/sms-conversation.service";
import { twilioService } from "@/services/twilio.service";

export default async function SmsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.role) {
    redirect("/login");
  }
  if (!hasPermission(session.user.role, "communications:read")) {
    redirect("/dashboard/access-denied");
  }

  const conversations = await smsConversationService.listConversations();

  return (
    <>
      <Header title="SMS" />
      <section className="flex-1 overflow-auto p-8">
        <PageHeader
          title="SMS inbox"
          description="Two-way texting managed by the SMS Assistant AI — template replies send automatically, drafted replies wait for approval, and anything urgent escalates to staff."
        />
        <SmsInbox
          initialConversations={conversations}
          role={session.user.role}
          twilioMode={twilioService.mode()}
        />
      </section>
    </>
  );
}
