import { afterEach, describe, expect, it, vi } from "vitest";
import { MetaApiError, postToFacebook, postToInstagram, type MetaConfig } from "./meta";

const config: MetaConfig = { token: "secret-token", version: "v23.0", pageId: "PAGE", instagramId: "IG" };

type Call = { url: string; params: URLSearchParams };

function mockGraph(handler: (path: string, params: URLSearchParams) => unknown) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(String(input));
      const params = init?.body ? new URLSearchParams(String(init.body)) : url.searchParams;
      const path = url.pathname.replace("/v23.0/", "");
      calls.push({ url: String(input), params });
      const body = handler(path, params);
      const status = (body as { error?: unknown })?.error ? 400 : 200;
      return new Response(JSON.stringify(body), { status });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("postToFacebook", () => {
  it("posts a single photo with the caption", async () => {
    const calls = mockGraph(() => ({ id: "photo1", post_id: "PAGE_post1" }));
    const result = await postToFacebook(config, { message: "hi", link: "https://x/p", imageUrls: ["https://img/1.jpg"] });
    expect(result).toEqual({ id: "PAGE_post1", permalink: "https://www.facebook.com/PAGE_post1" });
    expect(calls[0].url).toContain("/PAGE/photos");
    expect(calls[0].params.get("url")).toBe("https://img/1.jpg");
    // The token travels in the POST body, not the URL.
    expect(calls[0].url).not.toContain("secret-token");
    expect(calls[0].params.get("access_token")).toBe("secret-token");
  });

  it("uploads several photos unpublished, then attaches them to one post", async () => {
    let n = 0;
    const calls = mockGraph((path) => (path.endsWith("/photos") ? { id: `ph${++n}` } : { id: "PAGE_post2" }));
    const result = await postToFacebook(config, { message: "hi", link: "https://x/p", imageUrls: ["https://img/1.jpg", "https://img/2.jpg"] });
    expect(result.id).toBe("PAGE_post2");
    expect(calls.map((c) => c.params.get("published"))).toEqual(["false", "false", null]);
    const feed = calls[2];
    expect(feed.url).toContain("/PAGE/feed");
    expect(feed.params.get("attached_media[0]")).toBe(JSON.stringify({ media_fbid: "ph1" }));
    expect(feed.params.get("attached_media[1]")).toBe(JSON.stringify({ media_fbid: "ph2" }));
  });

  it("explains an expired token, and treats it as needing a fix rather than a retry", async () => {
    mockGraph(() => ({ error: { message: "Session has expired", code: 190 } }));
    const err = await postToFacebook(config, { message: "hi", link: "https://x/p", imageUrls: [] }).catch((e) => e);
    expect(err).toBeInstanceOf(MetaApiError);
    expect(err.transient).toBe(false);
    expect(err.message).toContain("META_PAGE_ACCESS_TOKEN");
  });

  it("treats rate limits as temporary", async () => {
    mockGraph(() => ({ error: { message: "Too many calls", code: 4 } }));
    const err = await postToFacebook(config, { message: "hi", link: "https://x/p", imageUrls: [] }).catch((e) => e);
    expect(err.transient).toBe(true);
  });
});

describe("postToInstagram", () => {
  it("builds a carousel, waits for it to finish processing, then publishes", async () => {
    let child = 0;
    let polls = 0;
    const calls = mockGraph((path, params) => {
      if (path === "IG/media" && params.get("is_carousel_item")) return { id: `child${++child}` };
      if (path === "IG/media") return { id: "carousel" };
      if (path === "carousel") return { status_code: ++polls < 2 ? "IN_PROGRESS" : "FINISHED" };
      if (path === "IG/media_publish") return { id: "media1" };
      if (path === "media1") return { permalink: "https://www.instagram.com/p/abc/" };
      throw new Error(`unexpected ${path}`);
    });
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const promise = postToInstagram(config, { caption: "cap", imageUrls: ["https://s/1", "https://s/2"] });
    await vi.runAllTimersAsync();
    const result = await promise;
    vi.useRealTimers();

    expect(result).toEqual({ id: "media1", permalink: "https://www.instagram.com/p/abc/" });
    const carousel = calls.find((c) => c.params.get("media_type") === "CAROUSEL");
    expect(carousel?.params.get("children")).toBe("child1,child2");
    expect(carousel?.params.get("caption")).toBe("cap");
    expect(calls.find((c) => c.url.includes("media_publish"))?.params.get("creation_id")).toBe("carousel");
  });

  it("refuses a post with no photos", async () => {
    await expect(postToInstagram(config, { caption: "cap", imageUrls: [] })).rejects.toThrow("at least one photo");
  });
});
