"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Send, CheckCircle, AlertCircle } from "lucide-react";

const contactSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name is too long"),
  email: z.string().email("Invalid email address"),
  message: z
    .string()
    .min(10, "Message must be at least 10 characters")
    .max(2000, "Message is too long"),
});

type ContactFormData = z.infer<typeof contactSchema>;

export default function ContactForm() {
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
  });

  async function onSubmit(data: ContactFormData) {
    setStatus("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to send");
      setStatus("success");
      reset();
    } catch {
      setStatus("error");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="glass-card w-full max-w-lg space-y-6 p-8">
      <div className="space-y-2">
        <Label htmlFor="name" className="text-zinc-300">
          Name
        </Label>
        <Input
          id="name"
          placeholder="Your name"
          className="border-white/10 bg-white/5 text-white placeholder:text-zinc-600 focus-visible:ring-indigo-500"
          {...register("name")}
        />
        {errors.name && (
          <p className="text-sm text-red-400">{errors.name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email" className="text-zinc-300">
          Email
        </Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          className="border-white/10 bg-white/5 text-white placeholder:text-zinc-600 focus-visible:ring-indigo-500"
          {...register("email")}
        />
        {errors.email && (
          <p className="text-sm text-red-400">{errors.email.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="message" className="text-zinc-300">
          Message
        </Label>
        <Textarea
          id="message"
          placeholder="Your message..."
          rows={5}
          className="border-white/10 bg-white/5 text-white placeholder:text-zinc-600 focus-visible:ring-indigo-500 resize-none"
          {...register("message")}
        />
        {errors.message && (
          <p className="text-sm text-red-400">{errors.message.message}</p>
        )}
      </div>

      <Button
        type="submit"
        disabled={status === "sending"}
        className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50"
      >
        {status === "sending" ? (
          "Sending..."
        ) : (
          <>
            <Send className="mr-2 h-4 w-4" />
            Send Message
          </>
        )}
      </Button>

      {status === "success" && (
        <div className="flex items-center gap-2 text-sm text-emerald-400">
          <CheckCircle className="h-4 w-4" />
          Message sent successfully!
        </div>
      )}

      {status === "error" && (
        <div className="flex items-center gap-2 text-sm text-red-400">
          <AlertCircle className="h-4 w-4" />
          Something went wrong. Please try again.
        </div>
      )}
    </form>
  );
}
