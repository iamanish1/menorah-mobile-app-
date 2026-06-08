import { NextResponse } from "next/server";
import { z } from "zod";
import { sendSubmissionEmail } from "@/lib/landing-email";
import { getLandingDatabase } from "@/lib/landing-mongodb";

const demoSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  company: z.string().trim().max(160).optional(),
  message: z.string().trim().max(2000).optional()
});

export async function POST(request: Request) {
  try {
    const parsed = demoSchema.safeParse(await request.json().catch(() => null));

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid request" }, { status: 400 });
    }

    const db = await getLandingDatabase();
    const emailDelivery = await sendSubmissionEmail({
      subject: "New Menorah demo request",
      source: "Demo request form",
      name: parsed.data.name,
      email: parsed.data.email,
      message: parsed.data.message,
      fields: {
        Company: parsed.data.company
      }
    });
    const document = {
      ...parsed.data,
      emailDelivery,
      createdAt: new Date(),
      userAgent: request.headers.get("user-agent") || undefined
    };

    const result = await db.collection("demo_requests").insertOne(document);
    return NextResponse.json({ ok: true, id: result.insertedId.toString(), emailDelivery }, { status: 201 });
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to save request" }, { status: 500 });
  }
}
