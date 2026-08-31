export default {
  async fetch(): Promise<Response> {
    return new Response("Loom bootstrap\n", {
      status: 503,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  },
};
