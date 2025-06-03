import prisma from "../../utils/prisma.js";
import { redis } from "../../utils/redis.js";
export const transactionModelGet = async (params) => {
    const { teamMemberProfile, limit, page, status } = params;
    const safeLimit = Math.min(Math.max(Number(limit), 1), 100);
    const safePage = Math.max(Number(page), 1);
    const version = (await redis.get(`transaction:${teamMemberProfile.company_member_id}:${status}:version`)) || "v1";
    const cacheKey = `transaction:${teamMemberProfile.company_member_id}:${status}:${page}:${limit}:${version}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
        return cached;
    }
    const totalTransactions = await prisma.company_transaction_table.count({
        where: {
            company_member_table: {
                company_member_id: teamMemberProfile.company_member_id,
            },
            company_transaction_type: status,
        },
    });
    const offset = (safePage - 1) * safeLimit;
    const transactionHistory = await prisma.company_transaction_table.findMany({
        where: {
            company_member_table: {
                company_member_id: teamMemberProfile.company_member_id,
            },
            company_transaction_type: status,
        },
        select: {
            company_transaction_description: true,
            company_transaction_amount: true,
            company_transaction_date: true,
            company_transaction_details: true,
            company_transaction_attachment: true,
            company_transaction_type: true,
            company_transaction_id: true,
        },
        skip: offset,
        take: safeLimit,
        orderBy: {
            company_transaction_date: "desc",
        },
    });
    const result = { totalTransactions, transactionHistory };
    await redis.set(cacheKey, JSON.stringify(result), { ex: 60 });
    return result;
};
