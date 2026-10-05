"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { SECTION_INDEX, externalLinkProps, isExternal, pad2 } from "@/components/sections/shared";
import { site } from "@/content/site";
import { cn } from "@/lib/utils";

const MENU_ID = "site-menu";
const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/* Scrolled state: the bar gains a surface once the page moves more than 8px. */
function subscribeToScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}
const getScrolled = () => window.scrollY > 8;
const getServerScrolled = () => false;

const sectionId = (href: string) => href.replace(/^#/, "");

/**
 * Id of the section crossing a thin band 45-50% down the viewport, or null.
 * Every section with an id is observed (not only the linked ones), so scrolling into the
 * hero or an unlinked section such as Capabilities clears the highlight.
 */
function useActiveSection(): string | null {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const sections = Array.from(document.querySelectorAll<HTMLElement>("main section[id]"));
    if (sections.length === 0) return;

    const intersecting = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) intersecting.add(entry.target.id);
          else intersecting.delete(entry.target.id);
        }
        const current = sections.find((section) => intersecting.has(section.id));
        setActive(current ? current.id : null);
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return active;
}

export default function Nav() {
  const scrolled = useSyncExternalStore(subscribeToScroll, getScrolled, getServerScrolled);
  const active = useActiveSection();
  const [open, setOpen] = useState(false);

  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => {
    // Commit synchronously so the page is interactive and scrollable again before the
    // browser follows an in-page link that was clicked inside the sheet.
    flushSync(() => setOpen(false));
    menuButtonRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!open) return;
    const sheet = sheetRef.current;
    const { body } = document;

    // Take the page behind the sheet out of reach. Elements that were already inert
    // (e.g. during the intro) are left alone so their state is not clobbered on close.
    const background = Array.from(document.querySelectorAll<HTMLElement>("main, footer")).filter(
      (el) => !el.hasAttribute("inert"),
    );
    background.forEach((el) => el.setAttribute("inert", ""));

    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    closeButtonRef.current?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
        return;
      }
      if (event.key !== "Tab" || !sheet) return;

      const focusables = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const current = document.activeElement;

      if (event.shiftKey && (current === first || !sheet.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || !sheet.contains(current))) {
        event.preventDefault();
        first.focus();
      }
    };

    // The sheet only exists below 768px: close it if the viewport grows past that.
    const wide = window.matchMedia("(min-width: 768px)");
    const onWide = () => {
      if (wide.matches) setOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    wide.addEventListener("change", onWide);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      wide.removeEventListener("change", onWide);
      background.forEach((el) => el.removeAttribute("inert"));
      body.style.overflow = previousOverflow;
    };
  }, [open, closeMenu]);

  return (
    <>
      <header
        data-reveal="nav"
        data-intro-inert
        className={cn(
          "fixed inset-x-0 top-0 z-50 h-(--nav-h) border-b transition-[background-color,border-color] duration-240 ease-out",
          scrolled ? "border-line bg-paper-raised/92" : "border-transparent bg-transparent",
        )}
      >
        <a
          href="#main"
          className="btn btn-primary btn-sm absolute top-2.5 left-(--gutter) z-10 -translate-y-[200%] focus-visible:translate-y-0 md:top-3.5"
        >
          Skip to content
        </a>

        <div className="container-site flex h-full items-center justify-between gap-6">
          <a
            href="#top"
            className="py-2 font-display text-[18px] leading-none font-medium tracking-[-0.005em] text-ink"
          >
            {site.name}
          </a>

          <nav aria-label="Primary" className="hidden items-center md:flex">
            <ul className="flex items-center gap-6 lg:gap-8">
              {site.nav.map((link) => {
                const isActive = active !== null && active === sectionId(link.href);
                return (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      aria-current={isActive ? "true" : undefined}
                      className={cn(
                        "inline-block py-2 text-[15px] leading-none transition-colors duration-150 ease-out hover:text-ink",
                        isActive
                          ? "text-ink underline decoration-tan decoration-1 underline-offset-[6px]"
                          : "text-ink-2",
                      )}
                    >
                      {link.label}
                    </a>
                  </li>
                );
              })}
            </ul>
            <a
              href={site.resume.href}
              {...externalLinkProps(site.resume.href)}
              className="btn btn-secondary btn-sm ml-6 lg:ml-8"
            >
              {site.resume.label}
              {isExternal(site.resume.href) && <span className="sr-only"> (opens in a new tab)</span>}
            </a>
          </nav>

          <button
            ref={menuButtonRef}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={MENU_ID}
            onClick={() => setOpen(true)}
            className="-mr-2 inline-flex h-11 items-center px-2 font-mono text-[0.8125rem] font-medium tracking-[0.08em] text-ink uppercase md:hidden"
          >
            Menu
          </button>
        </div>
      </header>

      {/*
        Mobile sheet. A sibling of <header> (not a child) so a transform on the header
        during the intro can never become its containing block. Visibility switches
        instantly on open (so focus can land) and only after the fade on close.
      */}
      <div
        ref={sheetRef}
        id={MENU_ID}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        inert={!open}
        className={cn(
          "fixed inset-0 z-60 flex flex-col bg-paper-raised duration-300 ease-out motion-reduce:transition-none md:hidden",
          open
            ? "visible opacity-100 transition-opacity"
            : "invisible opacity-0 transition-[opacity,visibility]",
        )}
      >
        <div className="container-site flex h-(--nav-h) shrink-0 items-center justify-between border-b border-line">
          <a
            href="#top"
            onClick={closeMenu}
            className="py-2 font-display text-[18px] leading-none font-medium tracking-[-0.005em] text-ink"
          >
            {site.name}
          </a>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close menu"
            onClick={closeMenu}
            className="-mr-2 inline-flex h-11 items-center gap-2 px-2 font-mono text-[0.8125rem] font-medium tracking-[0.08em] text-ink uppercase"
          >
            Close
            <X aria-hidden className="size-4" />
          </button>
        </div>

        <nav
          aria-label="Primary"
          className={cn(
            "container-site flex flex-1 flex-col overflow-y-auto pt-6 pb-10 transition-transform duration-300 ease-out motion-reduce:transition-none",
            open ? "translate-y-0" : "-translate-y-2",
          )}
        >
          <ol>
            {site.nav.map((link) => {
              const isActive = active !== null && active === sectionId(link.href);
              return (
                <li key={link.href} className="border-b border-line">
                  <a
                    href={link.href}
                    onClick={closeMenu}
                    aria-current={isActive ? "true" : undefined}
                    className="flex items-baseline gap-5 py-4 font-display text-[2.25rem] leading-[1.15] font-light text-ink"
                  >
                    <span aria-hidden className="t-label w-6 shrink-0">
                      {pad2(SECTION_INDEX[sectionId(link.href)] ?? 0)}
                    </span>
                    <span
                      className={cn(
                        isActive && "underline decoration-tan decoration-1 underline-offset-[8px]",
                      )}
                    >
                      {link.label}
                    </span>
                  </a>
                </li>
              );
            })}
          </ol>
          <a
            href={site.resume.href}
            {...externalLinkProps(site.resume.href)}
            onClick={closeMenu}
            className="btn btn-secondary mt-10 self-start"
          >
            {site.resume.label}
            {isExternal(site.resume.href) && <span className="sr-only"> (opens in a new tab)</span>}
          </a>
        </nav>
      </div>
    </>
  );
}