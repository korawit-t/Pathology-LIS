import api from "./httpClient";

export interface BlockTimelineEntry {
  event_type: string;
  source: "auto" | "manual";
  label: string;
  location?: string;
  note?: string;
  performed_by_name?: string;
  event_at: string;
  event_id?: number;
}

export interface BlockEventCreate {
  event_type: "SENT_TO_OUTLAB" | "RETURNED_FROM_OUTLAB" | "NOTE";
  location?: string;
  note?: string;
  event_at?: string;
}

export interface BlockEventResponse {
  id: number;
  block_id: number;
  event_type: string;
  location?: string;
  note?: string;
  performed_by: { id: number; full_name?: string; username: string };
  event_at: string;
  created_at: string;
}

export const BlockTimelineService = {
  getTimeline: (blockId: number): Promise<BlockTimelineEntry[]> =>
    api.get(`/surgical-blocks/${blockId}/timeline`).then((r) => r.data),

  addEvent: (
    blockId: number,
    payload: BlockEventCreate
  ): Promise<BlockEventResponse> =>
    api.post(`/surgical-blocks/${blockId}/events`, payload).then((r) => r.data),

  deleteEvent: (eventId: number): Promise<void> =>
    api.delete(`/surgical-blocks/events/${eventId}`).then(() => {}),
};
