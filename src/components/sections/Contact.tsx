import { ArrowUpRight } from "lucide-react";
import { site } from "@/content/site";
import SectionHeader from "./SectionHeader";
import { SECTION_INDEX, externalLinkProps, isExternal, stagger } from "./shared";

/*
  No form here by design: the email link is the call to action.
  A POST endpoint already exists at /api/contact (src/app/api/contact/route.ts,
  validates { name, email, message }) for a future contact form.
*/
export default function Contact() {
  const { contact } = site;

  return (
    <section
      id="contact"
      aria-labelledby="contact-title"
      data-intro-inert
      className="section-pad bg-sand"
    >
      {/* data-sr sits on the inner container so the sand band itself never fades or moves. */}
      <div data-sr className="container-site">
        <SectionHeader
          index={SECTION_INDEX.contact}
          id="contact-title"
          eyebrow={contact.eyebrow}
          title={contact.heading}
          titleClassName="t-display max-w-[18ch] text-balance text-ink"
        />

        <p className="mt-12 md:mt-16" {...stagger(1)}>
          <a
            href={`mailto:${contact.email}`}
            className="font-display text-[length:clamp(1.75rem,1.2rem+2vw,3rem)] leading-[1.15] font-light text-ink underline decoration-tan underline-offset-[0.18em] transition-[text-decoration-color] duration-150 ease-out [overflow-wrap:anywhere] [text-decoration-thickness:0.04em] hover:decoration-clay"
          >
            {contact.email}
          </a>
        </p>

        <div
          className="mt-14 flex flex-col gap-6 border-t border-line pt-8 md:mt-20 md:flex-row md:items-center md:justify-between"
          {...stagger(2)}
        >
          <ul aria-label="Social links" className="flex flex-wrap gap-3">
            {contact.socials.map((social) => (
              <li key={social.label}>
                <a
                  href={social.href}
                  {...externalLinkProps(social.href)}
                  className="btn btn-secondary btn-sm hover:bg-paper [&:hover_svg]:[transform:translate(2px,-2px)]"
                >
                  {social.label}
                  <ArrowUpRight aria-hidden />
                  {isExternal(social.href) && <span className="sr-only"> (opens in a new tab)</span>}
                </a>
              </li>
            ))}
          </ul>
          <p className="t-small text-ink-3 md:max-w-[36ch] md:text-right">{contact.note}</p>
        </div>
      </div>
    </section>
  );
}