import HomeClient from "../home-client";

export const dynamic = "force-dynamic";

export default async function BusinessHomePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <HomeClient businessSlug={slug} />;
}
