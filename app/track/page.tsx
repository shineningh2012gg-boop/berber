import TrackClient from './track-client';

export const dynamic = 'force-dynamic';

export default async function TrackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const params = await searchParams;
  return <TrackClient initialCode={params.code || ''} />;
}
