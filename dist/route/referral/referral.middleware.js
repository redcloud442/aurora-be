import { directReferralsSchemaPost, indirectReferralsSchemaPost, } from "../../schema/schema.js";
import { sendErrorResponse } from "../../utils/function.js";
import { protectionAdmin, protectionMemberUser, } from "../../utils/protection.js";
import { rateLimit } from "../../utils/redis.js";
export const referralDirectMiddleware = async (c, next) => {
    const user = c.get("user");
    const response = await protectionMemberUser(user);
    if (response instanceof Response) {
        return response;
    }
    const { teamMemberProfile } = response;
    if (!teamMemberProfile) {
        return sendErrorResponse("Unauthorized", 401);
    }
    const isAllowed = await rateLimit(`rate-limit:${teamMemberProfile?.company_member_id}:direct-get`, 50, "1m", c);
    if (!isAllowed) {
        return sendErrorResponse("Too many requests. Please try again later.", 429);
    }
    const { page, limit, search, columnAccessor, isAscendingSort } = await c.req.json();
    const parsedData = directReferralsSchemaPost.parse({
        page,
        limit,
        search,
        columnAccessor,
        isAscendingSort,
    });
    if (!parsedData) {
        console.log(parsedData);
        return sendErrorResponse("Invalid data", 400);
    }
    c.set("teamMemberProfile", teamMemberProfile);
    c.set("params", parsedData);
    await next();
};
export const referralIndirectMiddleware = async (c, next) => {
    const user = c.get("user");
    const response = await protectionMemberUser(user);
    if (response instanceof Response) {
        return response;
    }
    const { teamMemberProfile } = response;
    if (!teamMemberProfile) {
        return sendErrorResponse("Unauthorized", 401);
    }
    const isAllowed = await rateLimit(`rate-limit:${teamMemberProfile?.company_member_id}:indirect-get`, 50, "1m", c);
    if (!isAllowed) {
        return sendErrorResponse("Too many requests. Please try again later.", 429);
    }
    const { page, limit, search, columnAccessor, isAscendingSort } = await c.req.json();
    const parsedData = indirectReferralsSchemaPost.parse({
        page,
        limit,
        search,
        columnAccessor,
        isAscendingSort,
    });
    if (!parsedData) {
        return sendErrorResponse("Invalid request", 400);
    }
    c.set("teamMemberProfile", teamMemberProfile);
    c.set("params", parsedData);
    await next();
};
export const referralTotalGetMiddleware = async (c, next) => {
    const user = c.get("user");
    const response = await protectionAdmin(user);
    if (response instanceof Response) {
        return response;
    }
    const { teamMemberProfile } = response;
    if (!teamMemberProfile) {
        return sendErrorResponse("Unauthorized", 401);
    }
    const isAllowed = await rateLimit(`rate-limit:${teamMemberProfile?.company_member_id}:total-get`, 100, "1m", c);
    if (!isAllowed) {
        return sendErrorResponse("Too many requests. Please try again later.", 429);
    }
    c.set("teamMemberProfile", teamMemberProfile);
    await next();
};
