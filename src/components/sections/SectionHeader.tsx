import { cn } from "@/lib/utils";
import { pad2, stagger } from "./shared";

type SectionHeaderProps = {
  /** Catalogue number, rendered as "(01)". */
  index: number;
  eyebrow: string;
  title: string;
  /** Id of the h2; the section points at it with aria-labelledby. */
  id: string;
  className?: string;
  /** Replaces the default h2 type style (t-h2). */
  titleClassName?: string;
};

/** "(01) About" catalogue label over the section's h2. */
export default function SectionHeader({
  index,
  eyebrow,
  title,
  id,
  className,
  titleClassName,
}: SectionHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 md:gap-5", className)} {...stagger(0)}>
      <p className="t-label">
        <span className="text-clay">({pad2(index)})</span> {eyebrow}
      </p>
      <h2 id={id} className={titleClassName ?? "t-h2 max-w-[22ch] text-balance text-ink"}>
        {title}
      </h2>
    </div>
  );
}