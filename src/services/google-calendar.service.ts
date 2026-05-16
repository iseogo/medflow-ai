import { googleOAuthConfig, isGoogleCalendarLive } from "@/lib/integrations/env";
import { IntegrationHttpError, integrationFetch } from "@/lib/integrations/http";
import { safeLogContext } from "@/lib/integrations/safe-log";

export type CalendarEventInput = {
  summary: string;
  description?: string;
  start: Date;
  end: Date;
  attendeeEmail?: string;
};

export type CalendarEventResult = {
  eventId: string;
  htmlLink?: string;
  mode: "live" | "mock";
};

async function getAccessToken(): Promise<string> {
  const { clientId, clientSecret, refreshToken } = googleOAuthConfig();
  const res = await integrationFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new IntegrationHttpError("Google OAuth failed", res.status, "[redacted]");
  }
  return (JSON.parse(text) as { access_token: string }).access_token;
}

export const googleCalendarService = {
  mode(): "live" | "mock" {
    return isGoogleCalendarLive() ? "live" : "mock";
  },

  async createEvent(input: CalendarEventInput): Promise<CalendarEventResult> {
    if (!isGoogleCalendarLive()) {
      const id = `gcal_mock_${Date.now()}`;
      safeLogContext("google_calendar_mock", {
        summaryLength: input.summary.length,
      });
      return { eventId: id, mode: "mock" };
    }

    const { calendarId } = googleOAuthConfig();
    const token = await getAccessToken();
    const res = await integrationFetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: input.summary,
          description: input.description,
          start: { dateTime: input.start.toISOString() },
          end: { dateTime: input.end.toISOString() },
          attendees: input.attendeeEmail
            ? [{ email: input.attendeeEmail }]
            : undefined,
        }),
      }
    );

    const text = await res.text();
    if (!res.ok) {
      throw new IntegrationHttpError("Google Calendar create failed", res.status, text);
    }

    const json = JSON.parse(text) as { id: string; htmlLink?: string };
    return { eventId: json.id, htmlLink: json.htmlLink, mode: "live" };
  },

  async listUpcomingSlots(input: {
    timeMin: Date;
    timeMax: Date;
    maxResults?: number;
  }): Promise<{ start: string; end: string }[]> {
    if (!isGoogleCalendarLive()) {
      return [];
    }

    const { calendarId } = googleOAuthConfig();
    const token = await getAccessToken();
    const params = new URLSearchParams({
      timeMin: input.timeMin.toISOString(),
      timeMax: input.timeMax.toISOString(),
      maxResults: String(input.maxResults ?? 10),
      singleEvents: "true",
      orderBy: "startTime",
    });

    const res = await integrationFetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const text = await res.text();
    if (!res.ok) {
      throw new IntegrationHttpError("Google Calendar list failed", res.status, text);
    }

    const json = JSON.parse(text) as {
      items?: { start?: { dateTime?: string }; end?: { dateTime?: string } }[];
    };

    return (json.items ?? [])
      .filter((e) => e.start?.dateTime && e.end?.dateTime)
      .map((e) => ({
        start: e.start!.dateTime!,
        end: e.end!.dateTime!,
      }));
  },
};

export default googleCalendarService;
