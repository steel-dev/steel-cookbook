// https://github.com/steel-dev/steel-cookbook/tree/main/examples/convex-chat-with-page
// ABOUTME: Public Convex functions for the chat: createThread, sendMessage,
// ABOUTME: listMessages. Streams assistant replies over websockets via deltas.

import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  createThread,
  listMessages,
  syncStreams,
  vStreamArgs,
} from "@convex-dev/agent";
import { action, mutation, query } from "./_generated/server";
import { components } from "./_generated/api";
import { pageAgent } from "./agent";

export const createThreadForOwner = mutation({
  args: { ownerId: v.string() },
  handler: async (ctx, { ownerId }) => {
    return await createThread(ctx, components.agent, { userId: ownerId });
  },
});

export const sendMessage = action({
  args: {
    threadId: v.string(),
    ownerId: v.string(),
    prompt: v.string(),
  },
  handler: async (ctx, { threadId, ownerId, prompt }) => {
    const { thread } = await pageAgent.continueThread(ctx, {
      threadId,
      userId: ownerId,
    });
    const result = await thread.streamText(
      { prompt },
      { saveStreamDeltas: true },
    );
    await result.consumeStream();
  },
});

export const listThreadMessages = query({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: vStreamArgs,
  },
  handler: async (ctx, args) => {
    const paginated = await listMessages(ctx, components.agent, {
      threadId: args.threadId,
      paginationOpts: args.paginationOpts,
    });
    const streams = await syncStreams(ctx, components.agent, {
      threadId: args.threadId,
      streamArgs: args.streamArgs,
    });
    return { ...paginated, streams };
  },
});
