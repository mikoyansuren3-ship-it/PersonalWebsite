import ContactForm from "@/components/contact/ContactForm";
import { Code2, Link2, Mail } from "lucide-react";

export default function ContactPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-10 px-6 pt-24 pb-16">
      <div className="text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-indigo-400">
          Get in Touch
        </p>
        <h1 className="mt-3 font-heading text-4xl font-bold text-white sm:text-5xl">
          Contact Me
        </h1>
        <p className="mt-4 max-w-md text-zinc-400">
          Have a question or want to work together? Drop me a message and I&apos;ll
          get back to you as soon as possible.
        </p>
      </div>

      <ContactForm />

      <div className="flex items-center gap-6">
        <a
          href="mailto:your@email.com"
          className="text-zinc-500 transition-colors hover:text-indigo-400"
          aria-label="Email"
        >
          <Mail className="h-5 w-5" />
        </a>
        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-zinc-500 transition-colors hover:text-indigo-400"
          aria-label="GitHub"
        >
          <Code2 className="h-5 w-5" />
        </a>
        <a
          href="https://linkedin.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-zinc-500 transition-colors hover:text-indigo-400"
          aria-label="LinkedIn"
        >
          <Link2 className="h-5 w-5" />
        </a>
      </div>
    </div>
  );
}
