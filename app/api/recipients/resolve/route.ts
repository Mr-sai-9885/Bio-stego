import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RecipientLookup = {
  identifier?: string;
};

export async function POST(request: Request) {
  try {
    const sessionClient = await createSupabaseServer();
    const { data: { user }, error: userError } = await sessionClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Please sign in to find a recipient.' }, { status: 401 });
    }

    let body: RecipientLookup;
    try {
      body = await request.json() as RecipientLookup;
    } catch {
      return NextResponse.json({ error: 'Invalid recipient lookup request.' }, { status: 400 });
    }

    const identifier = body.identifier?.trim() ?? '';
    if (!identifier) {
      return NextResponse.json({ error: 'Enter the recipient email address.' }, { status: 400 });
    }

    const email = identifier.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceRoleKey || !supabaseUrl) {
      console.error('Recipient lookup requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL.');
      return NextResponse.json({ error: 'Recipient lookup is not configured.' }, { status: 500 });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const perPage = 1000;
    let page = 1;

    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) {
        console.error('Recipient account lookup failed:', error.message);
        return NextResponse.json({ error: 'Could not look up the recipient right now.' }, { status: 500 });
      }

      const recipient = data.users.find(
        (candidate) => candidate.email?.trim().toLowerCase() === email
      );

      if (recipient) {
        if (recipient.id === user.id) {
          return NextResponse.json({ error: 'You cannot send a message to yourself.' }, { status: 400 });
        }
        return NextResponse.json({ recipientId: recipient.id });
      }

      if (!data.nextPage) break;
      page = data.nextPage;
    }

    return NextResponse.json({ error: 'No registered recipient matches that email address.' }, { status: 404 });
  } catch (error) {
    console.error('Recipient lookup route failed:', error);
    return NextResponse.json({ error: 'Could not look up the recipient right now.' }, { status: 500 });
  }
}
