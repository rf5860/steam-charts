import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const appid = searchParams.get('appid');

  if (!appid) return NextResponse.json({ result: 0 });

  try {
    // Uses Steam Web API for current players
    const res = await fetch(`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appid}`);
    const data = await res.json();
    return NextResponse.json(data.response || { result: 0 });
  } catch (error) {
    return NextResponse.json({ result: 0 }, { status: 500 });
  }
}