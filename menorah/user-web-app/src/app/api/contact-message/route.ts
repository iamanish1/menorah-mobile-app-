import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sendSubmissionEmail } from '@/lib/landing-email';
import { getLandingDatabase } from '@/lib/landing-mongodb';

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  message: z.string().trim().min(1).max(3000),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 });
    }
    const db = await getLandingDatabase();
    const emailDelivery = await sendSubmissionEmail({
      subject: 'New Menorah contact message',
      source: 'Contact Us form',
      name: parsed.data.name,
      email: parsed.data.email,
      message: parsed.data.message,
    });
    const result = await db.collection('contact_messages').insertOne({
      ...parsed.data,
      source: 'contact-us-page',
      emailDelivery,
      createdAt: new Date(),
    });
    return NextResponse.json({ ok: true, id: result.insertedId.toString(), emailDelivery }, { status: 201 });
  } catch {
    return NextResponse.json({ ok: false, error: 'Unable to send message' }, { status: 500 });
  }
}
