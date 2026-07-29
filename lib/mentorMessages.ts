import { EASTERN_TZ } from "./timezone";

export interface MentorMessage {
  id: string;
  mentor_id: string;
  student_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

/** Timestamp shown next to each chat bubble - Eastern Time, same as everywhere else in Master Grid. */
export function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: EASTERN_TZ,
    timeZoneName: "short",
  });
}
