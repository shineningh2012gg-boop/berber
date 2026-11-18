import AdminClient from "../admin-client";

export const dynamic = "force-dynamic";

export default async function BusinessAdminPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <AdminClient businessSlug={slug} />;
}
