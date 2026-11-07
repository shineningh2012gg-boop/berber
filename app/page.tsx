import HomeClient from "./home-client";

// Avoid static prerendering while isolating the Next.js workStore invariant.
export const dynamic = "force-dynamic";

export default function HomePage() {
  return <HomeClient />;
}
