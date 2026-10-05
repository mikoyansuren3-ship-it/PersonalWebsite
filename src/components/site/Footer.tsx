import ReplayButton from "@/components/intro/ReplayButton";
import { site } from "@/content/site";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer data-intro-inert className="border-t border-line">
      <div className="container-site py-10 md:py-12">
        <div className="t-small flex flex-col gap-3 text-ink-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <p>
            © {year} {site.name}
          </p>
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <li>
              <a href="#top" className="link inline-flex items-center gap-1.5 py-2">
                Back to top <span aria-hidden>↑</span>
              </a>
            </li>
            <li>
              <ReplayButton variant="text" className="py-2" />
            </li>
          </ul>
        </div>
        <p className="t-label mt-6 sm:mt-8">Set in Newsreader, Instrument Sans &amp; IBM Plex Mono.</p>
      </div>
    </footer>
  );
}