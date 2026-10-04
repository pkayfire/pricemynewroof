// Event ID shared by the pixel and the Conversions API for one quote request, so OpenAI
// deduplicates the two reports of the same lead_created conversion. Client-safe.
export const leadEventId = (leadId: string): string => `lead_${leadId}`;
