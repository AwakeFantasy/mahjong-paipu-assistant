import { HomeClient } from "./home-client";

type PageProps = {
  searchParams?: Promise<{
    debug?: string;
    layoutPreview?: string;
    edit?: string;
  }>;
};

export default async function Home({ searchParams }: PageProps) {
  const params = await searchParams;

  return <HomeClient initialDebugMode={params?.debug === "1"} initialLayoutPreviewMode={params?.layoutPreview === "1"} initialLayoutEditMode={params?.edit === "1"} />;
}
