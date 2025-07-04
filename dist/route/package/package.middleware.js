import { claimPackagePutSchema, createPackagePostSchema, packagePostSchema, packageReinvestmentPostSchema, updatePackageSchema, } from "../../schema/schema.js";
import { sendErrorResponse } from "../../utils/function.js";
import { protectionAdmin, protectionMemberUser, } from "../../utils/protection.js";
import { rateLimit } from "../../utils/redis.js";
export const packagePostMiddleware = async (c, next) => {
    const user = c.get("user");
    const response = await protectionMemberUser(user);
    if (response instanceof Response) {
        return response;
    }
    const { teamMemberProfile } = response;
    if (!teamMemberProfile) {
        return sendErrorResponse("Unauthorized", 401);
    }
    const isAllowed = await rateLimit(`rate-limit:${teamMemberProfile.company_member_id}:package-post`, 50, "1m", c);
    if (!isAllowed) {
        return sendErrorResponse("Too Many Requests", 429);
    }
    const { amount, packageId } = await c.req.json();
    const { success, data } = packagePostSchema.safeParse({
        amount,
        packageId,
    });
    if (!success) {
        return c.json({ message: "Invalid request" }, 400);
    }
    c.set("params", data);
    c.set("teamMemberProfile", teamMemberProfile);
    await next();
};
export const packagePostListMiddleware = async (c, next) => {
    const user = c.get("user");
    const response = await protectionMemberUser(user);
    if (response instanceof Response) {
        return response;
    }
    const { teamMemberProfile } = response;
    if (!teamMemberProfile) {
        return sendErrorResponse("Unauthorized", 401);
    }
    const isAllowed = await rateLimit(`rate-limit:${teamMemberProfile.company_member_id}`, 50, "1m", c);
    if (!isAllowed) {
        return sendErrorResponse("Too Many Requests", 429);
    }
    c.set("teamMemberProfile", teamMemberProfile);
    await next();
};
export const packageGetMiddleware = async (c, next) => {
    const user = c.get("user");
    const response = await protectionMemberUser(user);
    if (response instanceof Response) {
        return response;
    }
    const { teamMemberProfile } = response;
    if (!teamMemberProfile) {
        return sendErrorResponse("Unauthorized", 401);
    }
    const isAllowed = await rateLimit(`rate-limit:${teamMemberProfile.company_member_id}:package-get`, 50, "1m", c);
    if (!isAllowed) {
        return sendErrorResponse("Too Many Requests", 429);
    }
    c.set("teamMemberProfile", teamMemberProfile);
    await next();
};
export const packageCreatePostMiddleware = async (c, next) => {
    const user = c.get("user");
    const response = await protectionAdmin(user);
    if (response instanceof Response) {
        return response;
    }
    const { teamMemberProfile } = response;
    if (!teamMemberProfile) {
        return sendErrorResponse("Unauthorized", 401);
    }
    const isAllowed = await rateLimit(`rate-limit:${teamMemberProfile.company_member_id}`, 100, "1m", c);
    if (!isAllowed) {
        return sendErrorResponse("Too Many Requests", 429);
    }
    const { packageName, packageDescription, packagePercentage, packageDays, packageColor, packageImage, } = await c.req.json();
    const validation = createPackagePostSchema.safeParse({
        packageName,
        packageDescription,
        packagePercentage,
        packageDays,
        packageColor,
        packageImage,
    });
    if (!validation.success) {
        return sendErrorResponse("Invalid request", 400);
    }
    await next();
};
export const packageUpdatePutMiddleware = async (c, next) => {
    const user = c.get("user");
    const response = await protectionAdmin(user);
    if (response instanceof Response) {
        return response;
    }
    const { teamMemberProfile } = response;
    if (!teamMemberProfile) {
        return sendErrorResponse("Unauthorized", 401);
    }
    const isAllowed = await rateLimit(`rate-limit:${teamMemberProfile.company_member_id}:package-update`, 100, "1m", c);
    if (!isAllowed) {
        return sendErrorResponse("Too Many Requests", 429);
    }
    const { packageData } = await c.req.json();
    const { packageName, packageDescription, packagePercentage, packageDays, packageIsDisabled, packageColor, package_image, } = packageData;
    const id = c.req.param("id");
    const validation = updatePackageSchema.safeParse({
        packageName,
        packageDescription,
        packagePercentage,
        packageDays,
        packageIsDisabled,
        packageColor,
        package_image,
        packageId: id,
    });
    if (!validation.success) {
        return sendErrorResponse("Invalid request", 400);
    }
    await next();
};
export const packagesClaimPostMiddleware = async (c, next) => {
    const user = c.get("user");
    const response = await protectionMemberUser(user);
    if (response instanceof Response) {
        return response;
    }
    const { teamMemberProfile } = response;
    if (!teamMemberProfile) {
        return sendErrorResponse("Unauthorized", 401);
    }
    const isAllowed = await rateLimit(`rate-limit:${teamMemberProfile.company_member_id}:package-claim`, 10, "1m", c);
    if (!isAllowed) {
        return sendErrorResponse("Too Many Requests", 429);
    }
    const { amount, earnings, packageConnectionId } = await c.req.json();
    const validation = claimPackagePutSchema.safeParse({
        amount,
        earnings,
        packageConnectionId,
    });
    if (!validation.success) {
        return sendErrorResponse("Invalid request", 400);
    }
    c.set("teamMemberProfile", teamMemberProfile);
    await next();
};
export const packagesGetListMiddleware = async (c, next) => {
    const user = c.get("user");
    const response = await protectionAdmin(user);
    if (response instanceof Response) {
        return response;
    }
    const { teamMemberProfile } = response;
    if (!teamMemberProfile) {
        return sendErrorResponse("Unauthorized", 401);
    }
    const isAllowed = await rateLimit(`rate-limit:${teamMemberProfile.company_member_id}:package-list`, 100, "1m", c);
    if (!isAllowed) {
        return sendErrorResponse("Too Many Requests", 429);
    }
    c.set("teamMemberProfile", teamMemberProfile);
    await next();
};
export const packageReinvestmentPostMiddleware = async (c, next) => {
    const user = c.get("user");
    const response = await protectionMemberUser(user);
    if (response instanceof Response) {
        return response;
    }
    const { teamMemberProfile } = response;
    if (!teamMemberProfile) {
        return sendErrorResponse("Unauthorized", 401);
    }
    const isAllowed = await rateLimit(`rate-limit:${teamMemberProfile.company_member_id}:package-post`, 50, "1m", c);
    if (!isAllowed) {
        return sendErrorResponse("Too Many Requests", 429);
    }
    const { amount, packageId, packageConnectionId } = await c.req.json();
    const { success, data } = packageReinvestmentPostSchema.safeParse({
        amount,
        packageId,
        packageConnectionId,
    });
    if (!success) {
        return c.json({ message: "Invalid request" }, 400);
    }
    c.set("params", data);
    c.set("teamMemberProfile", teamMemberProfile);
    await next();
};
