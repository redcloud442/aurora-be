import type { Context, Next } from "hono";
import {
  bannerDeleteSchema,
  bannerPostSchema,
  bannerPutSchema,
} from "../../schema/schema.js";
import { sendErrorResponse } from "../../utils/function.js";
import { protectionMemberUser } from "../../utils/protection.js";
import { rateLimit } from "../../utils/redis.js";

export const bannerPostMiddleware = async (c: Context, next: Next) => {
  const user = c.get("user");

  const response = await protectionMemberUser(user);

  if (response instanceof Response) {
    return response;
  }

  const { teamMemberProfile } = response;

  if (!teamMemberProfile) {
    return sendErrorResponse("Unauthorized", 401);
  }

  const isAllowed = await rateLimit(
    `rate-limit:${teamMemberProfile.company_member_id}:banner-post`,
    10,
    "1m",
    c
  );

  if (!isAllowed) {
    return sendErrorResponse("Too Many Requests", 429);
  }

  const { company_promo_image } = await c.req.json();

  const sanitizedData = bannerPostSchema.safeParse({
    company_promo_image,
  });

  if (!sanitizedData.success) {
    return sendErrorResponse("Invalid Request", 400);
  }

  c.set("teamMemberProfile", teamMemberProfile);

  c.set("params", sanitizedData.data);

  return await next();
};

export const bannerPutMiddleware = async (c: Context, next: Next) => {
  const user = c.get("user");

  const response = await protectionMemberUser(user);

  if (response instanceof Response) {
    return response;
  }

  const { teamMemberProfile } = response;

  if (!teamMemberProfile) {
    return sendErrorResponse("Unauthorized", 401);
  }

  const isAllowed = await rateLimit(
    `rate-limit:${teamMemberProfile.company_member_id}:banner-put`,
    10,
    "1m",
    c
  );

  if (!isAllowed) {
    return sendErrorResponse("Too Many Requests", 429);
  }

  const { company_promo_image } = await c.req.json();
  const { id } = c.req.param();

  const sanitizedData = bannerPutSchema.safeParse({
    company_promo_image,
    id,
  });

  if (!sanitizedData.success) {
    return sendErrorResponse("Invalid Request", 400);
  }

  c.set("teamMemberProfile", teamMemberProfile);

  c.set("params", sanitizedData.data);

  return await next();
};

export const bannerDeleteMiddleware = async (c: Context, next: Next) => {
  const user = c.get("user");

  const response = await protectionMemberUser(user);

  if (response instanceof Response) {
    return response;
  }

  const { teamMemberProfile } = response;

  if (!teamMemberProfile) {
    return sendErrorResponse("Unauthorized", 401);
  }

  const isAllowed = await rateLimit(
    `rate-limit:${teamMemberProfile.company_member_id}:banner-delete`,
    10,
    "1m",
    c
  );

  if (!isAllowed) {
    return sendErrorResponse("Too Many Requests", 429);
  }

  const { id } = c.req.param();

  const sanitizedData = bannerDeleteSchema.safeParse({
    id,
  });

  if (!sanitizedData.success) {
    return sendErrorResponse("Invalid Request", 400);
  }

  c.set("teamMemberProfile", teamMemberProfile);

  c.set("params", sanitizedData.data);

  return await next();
};

export const bannerGetMiddleware = async (c: Context, next: Next) => {
  const user = c.get("user");

  const response = await protectionMemberUser(user);

  if (response instanceof Response) {
    return response;
  }

  const { teamMemberProfile } = response;

  if (!teamMemberProfile) {
    return sendErrorResponse("Unauthorized", 401);
  }

  const isAllowed = await rateLimit(
    `rate-limit:${teamMemberProfile.company_member_id}:banner-get`,
    10,
    "1m",
    c
  );

  if (!isAllowed) {
    return sendErrorResponse("Too Many Requests", 429);
  }

  c.set("teamMemberProfile", teamMemberProfile);

  return await next();
};
