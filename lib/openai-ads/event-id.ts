// Event IDs shared by the pixel and the Conversions API, so OpenAI deduplicates the two reports of
// the same lead_created conversion. Client-safe.
export const leadEventId = (leadId: string): string => `lead_${leadId}`;

/** A call click counts once per estimate, however many times the button is clicked. */
export const callEventId = (estimateId: string): string => `call_${estimateId}`;

export const isCallEventId = (id: string): boolean => /^call_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
