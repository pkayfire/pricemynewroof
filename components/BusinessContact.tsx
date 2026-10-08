import { BUSINESS } from "@/lib/site/business";

/** Legal name, mailing address, email and phone, as an <address> block. */
export function BusinessContact() {
  return (
    <address className="business-contact">
      {BUSINESS.legalName}
      {BUSINESS.mailingAddress?.map((line) => (
        <span key={line}>
          <br />
          {line}
        </span>
      ))}
      <br />
      <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>
      {BUSINESS.phone ? (
        <>
          <br />
          <a href={`tel:${BUSINESS.phone.replace(/[^\d+]/g, "")}`}>{BUSINESS.phone}</a>
        </>
      ) : null}
    </address>
  );
}
