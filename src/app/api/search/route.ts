import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const term = searchParams.get('term');

  if (!term) return NextResponse.json({ items: [] });

  try {
    // Uses Steam Store Search API
    const res = await fetch(`https://store.steampowered.com/api/storesearch/?term=${term}&l=english&cc=US`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}