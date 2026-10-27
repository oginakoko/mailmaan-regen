import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Markdown } from "@/lib/docs/render";

const GUIDES: Record<string, { file: string; title: string; description: string }> = {
  "developer-guide": {
    file: "docs/developer-guide.md",
    title: "Developer guide",
    description: "Connect your app to Mailmaan in five minutes.",
  },
  "soko-demo": {
    file: "docs/soko-demo.md",
    title: "Soko demo build",
    description: "The live storefront as example implementation.",
  },
};

export function generateStaticParams() {
  return Object.keys(GUIDES).map((slug) => ({ slug }));
}

async function loadGuide(file: string): Promise<string> {
  "use cache";
  return readFile(join(process.cwd(), file), "utf8");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = GUIDES[slug];
  if (!guide) return {};
  return { title: `${guide.title} — Mailmaan docs`, description: guide.description };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = GUIDES[slug];
  if (!guide) notFound();
  const source = await loadGuide(guide.file);
  return (
    <article>
      <Markdown source={source} />
    </article>
  );
}
