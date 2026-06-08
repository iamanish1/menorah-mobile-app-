"use client";

import { FormEvent, useState } from "react";
import { Send } from "lucide-react";

type FormState = "idle" | "submitting" | "success" | "error";
type SubmissionResponse = {
  ok?: boolean;
  emailDelivery?: {
    sent: boolean;
  };
};

export function FaqQuestionForm() {
  const [state, setState] = useState<FormState>("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setMessage("");

    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const response = await fetch("/api/faq-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          email: formData.get("email"),
          message: formData.get("message")
        })
      });

      const result = (await response.json().catch(() => ({}))) as SubmissionResponse;

      if (!response.ok) {
        throw new Error("Request failed");
      }

      form.reset();
      setState("success");
      setMessage(result.emailDelivery?.sent ? "Your question has been sent." : "Your question has been saved. Email delivery needs SMTP setup.");
    } catch {
      setState("error");
      setMessage("Something went wrong. Please try again.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto mt-8 grid max-w-2xl gap-4 text-left">
      <label className="grid gap-2 text-sm font-medium">
        Name
        <input
          name="name"
          type="text"
          required
          className="h-12 rounded-lg border border-menorah-cream bg-background px-4 outline-none transition focus:border-menorah-olive focus:ring-2 focus:ring-menorah-cream"
        />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Email*
        <input
          name="email"
          type="email"
          required
          className="h-12 rounded-lg border border-menorah-cream bg-background px-4 outline-none transition focus:border-menorah-olive focus:ring-2 focus:ring-menorah-cream"
        />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Message
        <textarea
          name="message"
          required
          rows={5}
          className="resize-none rounded-lg border border-menorah-cream bg-background px-4 py-3 outline-none transition focus:border-menorah-olive focus:ring-2 focus:ring-menorah-cream"
        />
      </label>
      <button
        type="submit"
        disabled={state === "submitting"}
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-7 text-base font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
      >
        <Send className="h-4 w-4" aria-hidden="true" />
        {state === "submitting" ? "Sending" : "Send"}
      </button>
      <p className="text-center text-xs leading-5 text-foreground/60">
        This site is protected by reCAPTCHA and the Google Privacy Policy and Terms of Service apply.
      </p>
      {message ? (
        <p className={`text-center text-sm font-medium ${state === "success" ? "text-success" : "text-destructive"}`}>{message}</p>
      ) : null}
    </form>
  );
}
