import "server-only";
import { readingMinutes } from "../markdown";
import { db, getTenantId } from "./client";

/** A story in The Mira Journal. Stored in blog_posts; `content` is Markdown (see lib/markdown.ts). */
export interface Guide {
  slug: string;
  title: string;
  category: string;
  excerpt: string;
  content: string;
  minutes: number;
  publishedAt: string;
  updatedAt: string;
}

interface GuideRow {
  slug: string;
  title: string;
  content: string;
  category: string | null;
  excerpt: string | null;
  created_at: string;
  updated_at: string;
}

const COLUMNS = "slug, title, content, category, excerpt, created_at, updated_at";

function toGuide(row: GuideRow): Guide {
  const excerpt = row.excerpt ?? (row.content.length > 160 ? `${row.content.slice(0, 157)}...` : row.content);
  return {
    slug: row.slug,
    title: row.title,
    category: row.category ?? "Journal",
    excerpt,
    content: row.content,
    minutes: readingMinutes(row.content),
    publishedAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getGuides(): Promise<Guide[]> {
  const tenantId = await getTenantId();
  const { data, error } = await db()
    .from("blog_posts")
    .select(COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("status", "PUBLISHED")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load journal stories: ${error.message}`);
  return ((data ?? []) as GuideRow[]).map(toGuide);
}

export async function getGuideBySlug(slug: string): Promise<Guide | undefined> {
  const tenantId = await getTenantId();
  const { data } = await db().from("blog_posts").select(COLUMNS).eq("tenant_id", tenantId).eq("status", "PUBLISHED").eq("slug", slug).maybeSingle();
  if (!data) return undefined;
  return toGuide(data as GuideRow);
}
