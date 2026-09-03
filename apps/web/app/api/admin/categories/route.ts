import { NextResponse } from "next/server";
import { getCategories } from "@/lib/data/categories";

export const runtime = "nodejs";

/** Category list for admin pickers (e.g. the AliExpress staging review's category dropdown). */
export async function GET() {
  try {
    const categories = await getCategories();
    return NextResponse.json({ categories: categories.map((c) => ({ id: c.id, handle: c.handle, name: c.name })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load categories" }, { status: 500 });
  }
}
