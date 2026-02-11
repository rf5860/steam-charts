import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const appid = searchParams.get('appid');

  if (!appid) return NextResponse.json({ error: 'AppID required' }, { status: 400 });

  try {
    // Fetch the public page from SteamCharts
    const response = await fetch(`https://steamcharts.com/app/${appid}/chart-data.json`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) throw new Error('Failed to fetch from source');

    const html = await response.text();

    // The response should be JSON
    const rawData = JSON.parse(html);
    // Format data: [timestamp (ms), count]
    // SteamCharts timestamps are usually in milliseconds already, or seconds * 1000
    const formattedData = rawData.map((point: number[]) => ({
      date: point[0], 
      count: point[1]
    }));

    return NextResponse.json({ data: formattedData });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}