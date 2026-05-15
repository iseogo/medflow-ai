import { TimelineEventType } from "@prisma/client";
import { formatDate } from "@/lib/utils";

type TimelineEvent = {
  id: string;
  eventType: TimelineEventType;
  title: string;
  description: string | null;
  createdAt: Date;
  actor: {
    firstName: string;
    lastName: string;
  } | null;
};

export function ClientTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        No timeline events yet.
      </p>
    );
  }

  return (
    <ol className="relative border-l border-slate-200 pl-6">
      {events.map((event) => (
        <li key={event.id} className="mb-6 last:mb-0">
          <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-medflow-500" />
          <p className="text-sm font-medium text-slate-900">{event.title}</p>
          {event.description && (
            <p className="mt-0.5 text-sm text-slate-600">{event.description}</p>
          )}
          <p className="mt-1 text-xs text-slate-500">
            {formatDate(event.createdAt)}
            {event.actor &&
              ` · ${event.actor.firstName} ${event.actor.lastName}`}
          </p>
        </li>
      ))}
    </ol>
  );
}
