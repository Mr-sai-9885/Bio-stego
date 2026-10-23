import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/login?oauth_error=callback', requestUrl));
  }

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('OAuth callback session exchange failed:', error.message);
    return NextResponse.redirect(new URL('/login?oauth_error=callback', requestUrl));
  }

  return NextResponse.redirect(new URL('/dashboard', requestUrl));
}
