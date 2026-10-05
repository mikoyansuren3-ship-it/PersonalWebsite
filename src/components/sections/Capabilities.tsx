import { site } from "@/content/site";
import SectionHeader from "./SectionHeader";
import { SECTION_INDEX, stagger } from "./shared";

export default function Capabilities() {
  const { capabilities } = site;

  return (
    <section
      id="capabilities"
      aria-labelledby="capabilities-title"
      data-sr
      data-intro-inert
      className="section-pad"
    >
      <div className="container-site">
        <SectionHeader
          index={SECTION_INDEX.capabilities}
          id="capabilities-title"
          eyebrow={capabilities.eyebrow}
          title={capabilities.heading}
        />

        {/* One column below 768px, three equal columns (4 of 12 each) above. */}
        <div className="grid-site mt-12 gap-y-14 md:mt-16">
          {capabilities.groups.map((group, i) => (
            <div key={i} className="col-span-12 md:col-span-4" {...stagger(i + 1)}>
              <p aria-hidden className="t-label">
                {SECTION_INDEX.capabilities}.{i + 1}
              </p>
              <h3 className="t-h3 mt-2 text-ink">{group.title}</h3>
              <ul className="mt-5 border-t border-line">
                {group.items.map((item, j) => (
                  <li key={`${item}-${j}`} className="border-b border-line py-3 text-ink">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}