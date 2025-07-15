export default {
  async fetch(request: Request): Promise<Response> {
    return Response.json({
      message: "Hello from Alchemy!",
      timestamp: new Date().toISOString(),
    });
  },
};