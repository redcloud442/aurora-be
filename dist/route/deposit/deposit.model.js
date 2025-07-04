import { Prisma } from "@prisma/client";
import { endOfDay, endOfMonth, parseISO, setDate, setHours, setMilliseconds, setMinutes, setSeconds, } from "date-fns";
import {} from "../../schema/schema.js";
import { getPhilippinesTime } from "../../utils/function.js";
import prisma from "../../utils/prisma.js";
import { redis } from "../../utils/redis.js";
export const depositPostModel = async (params) => {
    const { amount, accountName, accountNumber, topUpMode } = params.TopUpFormValues;
    const { publicUrl } = params;
    if (amount.length > 7 || amount.length < 3) {
        throw new Error("Invalid amount");
    }
    const merchantData = await prisma.merchant_table.findFirst({
        where: {
            merchant_id: topUpMode,
        },
        select: {
            merchant_account_name: true,
            merchant_account_number: true,
            merchant_account_type: true,
        },
    });
    if (!merchantData) {
        throw new Error("Invalid account name or number");
    }
    const existingDeposit = await prisma.company_deposit_request_table.findFirst({
        where: {
            company_deposit_request_member_id: params.teamMemberProfile.company_member_id,
            company_deposit_request_status: "PENDING",
        },
        take: 1,
        orderBy: {
            company_deposit_request_date: "desc",
        },
    });
    if (existingDeposit) {
        throw new Error("You cannot make a new deposit request.");
    }
    await prisma.$transaction(async (tx) => {
        await tx.company_deposit_request_table.create({
            data: {
                company_deposit_request_amount: Number(amount),
                company_deposit_request_type: merchantData.merchant_account_type,
                company_deposit_request_name: accountName,
                company_deposit_request_account: accountNumber,
                company_deposit_request_attachment: publicUrl,
                company_deposit_request_member_id: params.teamMemberProfile.company_member_id,
            },
        });
        await tx.company_transaction_table.create({
            data: {
                company_transaction_amount: Number(amount),
                company_transaction_description: "Deposit Pending",
                company_transaction_details: `Account Name: ${accountName}, Account Number: ${accountNumber}`,
                company_transaction_member_id: params.teamMemberProfile.company_member_id,
                company_transaction_type: "DEPOSIT",
            },
        });
    });
};
export const depositPutModel = async (params) => {
    const { status, note, requestId, teamMemberProfile } = params;
    const merchant = await prisma.merchant_member_table.findFirst({
        where: {
            merchant_member_merchant_id: teamMemberProfile.company_member_id,
        },
    });
    if (!merchant && teamMemberProfile.company_member_role === "MERCHANT")
        throw new Error("Merchant not found.");
    const data = await prisma.$transaction(async (tx) => {
        const existingRequest = await tx.company_deposit_request_table.findUnique({
            where: {
                company_deposit_request_id: requestId,
            },
        });
        if (!existingRequest) {
            throw new Error("Request not found.");
        }
        if (existingRequest.company_deposit_request_status !== "PENDING") {
            throw new Error("Request has already been processed.");
        }
        const updatedRequest = await tx.company_deposit_request_table.update({
            where: { company_deposit_request_id: requestId },
            data: {
                company_deposit_request_status: status,
                company_deposit_request_approved_by: teamMemberProfile.company_member_id,
                company_deposit_request_reject_note: note ?? null,
                company_deposit_request_date_updated: new Date(),
            },
        });
        await tx.company_transaction_table.create({
            data: {
                company_transaction_description: status.charAt(0).toUpperCase() + status.slice(1).toLowerCase(),
                company_transaction_details: `${note
                    ? `${note}`
                    : `Account Name: ${updatedRequest.company_deposit_request_name}, Account Number: ${updatedRequest.company_deposit_request_account}`}`,
                company_transaction_amount: updatedRequest.company_deposit_request_amount,
                company_transaction_member_id: updatedRequest.company_deposit_request_member_id,
                company_transaction_type: "DEPOSIT",
                company_transaction_attachment: status === "REJECTED"
                    ? updatedRequest.company_deposit_request_attachment
                    : null,
            },
        });
        if (status === "APPROVED") {
            const updatedEarnings = await tx.company_earnings_table.upsert({
                where: {
                    company_earnings_member_id: updatedRequest.company_deposit_request_member_id,
                },
                create: {
                    company_earnings_member_id: updatedRequest.company_deposit_request_member_id,
                    company_member_wallet: updatedRequest.company_deposit_request_amount,
                    company_combined_earnings: updatedRequest.company_deposit_request_amount,
                },
                update: {
                    company_member_wallet: {
                        increment: updatedRequest.company_deposit_request_amount,
                    },
                    company_combined_earnings: {
                        increment: updatedRequest.company_deposit_request_amount,
                    },
                },
            });
            if (merchant && status === "APPROVED") {
                if (updatedRequest.company_deposit_request_amount >
                    merchant.merchant_member_balance) {
                    throw new Error("Insufficient balance. Cannot proceed with the update.");
                }
                const updatedMerchant = await tx.merchant_member_table.update({
                    where: { merchant_member_id: merchant.merchant_member_id },
                    data: {
                        merchant_member_balance: {
                            decrement: updatedRequest.company_deposit_request_amount,
                        },
                    },
                });
                return {
                    updatedRequest,
                    updatedEarnings,
                    updatedMerchant,
                };
            }
        }
        else {
            return { updatedRequest };
        }
        return { updatedRequest };
    });
    return data;
};
export const depositHistoryPostModel = async (params, teamMemberProfile) => {
    const { page, limit, search, columnAccessor, isAscendingSort, userId } = params;
    const offset = (page - 1) * limit;
    const sortBy = isAscendingSort ? "ASC" : "DESC";
    const orderBy = columnAccessor
        ? Prisma.sql `ORDER BY ${Prisma.raw(columnAccessor)} ${Prisma.raw(sortBy)}`
        : Prisma.empty;
    const commonConditions = [
        Prisma.raw(`m.company_member_company_id = '${teamMemberProfile.company_member_company_id}'::uuid AND m.company_member_id = '${userId}'::uuid`),
    ];
    if (search) {
        commonConditions.push(Prisma.raw(`(
            u.user_username ILIKE '%${search}%'
            OR u.user_id::TEXT ILIKE '%${search}%'
            OR u.user_first_name ILIKE '%${search}%'
            OR u.user_last_name ILIKE '%${search}%'
          )`));
    }
    const dataQueryConditions = [...commonConditions];
    const dataWhereClause = Prisma.sql `${Prisma.join(dataQueryConditions, " AND ")}`;
    const depositHistory = await prisma.$queryRaw `
      SELECT
        u.user_first_name,
        u.user_last_name,
        u.user_email,
        m.company_member_id,
        t.*
      FROM company_schema.company_deposit_request_table t
      JOIN company_schema.company_member_table m
        ON t.company_deposit_request_member_id = m.company_member_id
      JOIN user_schema.user_table u
        ON u.user_id = m.company_member_user_id
      WHERE ${dataWhereClause}
      ${orderBy}
      LIMIT ${Prisma.raw(limit.toString())}
      OFFSET ${Prisma.raw(offset.toString())}
    `;
    const totalCount = await prisma.$queryRaw `
        SELECT
          COUNT(*) AS count
        FROM company_schema.company_deposit_request_table t
        JOIN company_schema.company_member_table m
          ON t.company_deposit_request_member_id = m.company_member_id
        JOIN user_schema.user_table u
        ON u.user_id = m.company_member_user_id
      WHERE ${dataWhereClause}
    `;
    return { data: depositHistory, totalCount: Number(totalCount[0].count) };
};
export const depositListPostModel = async (params, teamMemberProfile) => {
    const { page, limit, search, isAscendingSort, columnAccessor, merchantFilter, userFilter, statusFilter, dateFilter, } = params;
    let returnData = {
        data: {
            APPROVED: { data: [], count: BigInt(0) },
            REJECTED: { data: [], count: BigInt(0) },
            PENDING: { data: [], count: BigInt(0) },
        },
        totalPendingDeposit: 0,
        totalApprovedDeposit: 0,
        totalCount: BigInt(0),
    };
    const offset = (page - 1) * limit;
    const sortBy = isAscendingSort ? "DESC" : "ASC";
    const orderBy = columnAccessor
        ? Prisma.sql `ORDER BY ${Prisma.raw(columnAccessor)} ${Prisma.raw(sortBy)}`
        : Prisma.empty;
    const commonConditions = [
        Prisma.raw(`m.company_member_company_id = '${teamMemberProfile.company_member_company_id}'::uuid`),
    ];
    if (merchantFilter) {
        commonConditions.push(Prisma.raw(`approver.user_id::TEXT = '${merchantFilter}'`));
    }
    if (userFilter) {
        commonConditions.push(Prisma.raw(`u.user_id::TEXT = '${userFilter}'`));
    }
    if (dateFilter?.start && dateFilter?.end) {
        const startDate = getPhilippinesTime(new Date(dateFilter.start || new Date()), "start");
        const endDate = getPhilippinesTime(new Date(dateFilter.end || new Date()), "end");
        commonConditions.push(Prisma.raw(`t.company_deposit_request_date::timestamptz at time zone 'Asia/Manila' BETWEEN '${startDate}'::timestamptz AND '${endDate}'::timestamptz`));
    }
    if (search) {
        commonConditions.push(Prisma.raw(`(
          u.user_username ILIKE '%${search}%'
          OR u.user_id::TEXT ILIKE '%${search}%'
          OR u.user_first_name ILIKE '%${search}%'
          OR u.user_last_name ILIKE '%${search}%'
        )`));
    }
    const dataQueryConditions = [...commonConditions];
    if (statusFilter) {
        dataQueryConditions.push(Prisma.raw(`t.company_deposit_request_status = '${statusFilter}'`));
    }
    const dataWhereClause = Prisma.sql `${Prisma.join(dataQueryConditions, " AND ")}`;
    const countWhereClause = Prisma.sql `${Prisma.join(commonConditions, " AND ")}`;
    const topUpRequests = await prisma.$queryRaw `
    SELECT
      u.user_id,
      u.user_first_name,
      u.user_last_name,
      u.user_email,
      u.user_username,
      m.company_member_id,
      t.*,
      approver.user_username AS approver_username
    FROM company_schema.company_deposit_request_table t
    JOIN company_schema.company_member_table m
      ON t.company_deposit_request_member_id = m.company_member_id
    JOIN user_schema.user_table u
      ON u.user_id = m.company_member_user_id
    LEFT JOIN company_schema.company_member_table mt
      ON mt.company_member_id = t.company_deposit_request_approved_by
    LEFT JOIN user_schema.user_table approver
      ON approver.user_id = mt.company_member_user_id
    WHERE ${dataWhereClause}
    ${orderBy}
    LIMIT ${Prisma.raw(limit.toString())}
    OFFSET ${Prisma.raw(offset.toString())}
  `;
    const statusCounts = await prisma.$queryRaw `
      SELECT
        t.company_deposit_request_status AS status,
        COUNT(*) AS count
      FROM company_schema.company_deposit_request_table t
      JOIN company_schema.company_member_table m
        ON t.company_deposit_request_member_id = m.company_member_id
      JOIN user_schema.user_table u
        ON u.user_id = m.company_member_user_id
      LEFT JOIN company_schema.company_member_table mt
        ON mt.company_member_id = t.company_deposit_request_approved_by
      LEFT JOIN user_schema.user_table approver
        ON approver.user_id = mt.company_member_user_id
      WHERE ${countWhereClause}
      GROUP BY t.company_deposit_request_status
    `;
    ["APPROVED", "REJECTED", "PENDING"].forEach((status) => {
        const match = statusCounts.find((item) => item.status === status);
        returnData.data[status].count = match
            ? BigInt(match.count)
            : BigInt(0);
    });
    topUpRequests.forEach((request) => {
        const status = request.company_deposit_request_status;
        if (returnData.data[status]) {
            returnData.data[status].data.push(request);
        }
    });
    returnData.totalCount = statusCounts.reduce((sum, item) => sum + BigInt(item.count), BigInt(0));
    if (teamMemberProfile.company_member_role === "MERCHANT") {
        const merchant = await prisma.merchant_member_table.findFirst({
            where: {
                merchant_member_merchant_id: teamMemberProfile.company_member_id,
            },
            select: {
                merchant_member_balance: true,
            },
        });
        returnData.merchantBalance = merchant?.merchant_member_balance;
    }
    const startDate = dateFilter.start && dateFilter.end
        ? getPhilippinesTime(new Date(dateFilter.start), "start")
        : undefined;
    const endDate = dateFilter.end && dateFilter.start
        ? getPhilippinesTime(new Date(dateFilter.end), "end")
        : undefined;
    const totalPendingDeposit = await prisma.company_deposit_request_table.aggregate({
        _sum: {
            company_deposit_request_amount: true,
        },
        where: {
            company_deposit_request_status: "PENDING",
            company_deposit_request_date: {
                gte: startDate,
                lte: endDate,
            },
        },
    });
    returnData.totalPendingDeposit =
        totalPendingDeposit._sum.company_deposit_request_amount || 0;
    if (teamMemberProfile.company_member_role === "MERCHANT" ||
        teamMemberProfile.company_member_role === "ADMIN") {
        const totalApprovedDeposit = await prisma.company_deposit_request_table.aggregate({
            _sum: {
                company_deposit_request_amount: true,
            },
            where: {
                company_deposit_request_status: "APPROVED",
                company_deposit_request_date: {
                    gte: startDate,
                    lte: endDate,
                },
            },
        });
        returnData.totalApprovedDeposit =
            Number(totalApprovedDeposit._sum.company_deposit_request_amount) || 0;
    }
    return JSON.parse(JSON.stringify(returnData, (key, value) => typeof value === "bigint" ? value.toString() : value));
};
export const depositReferencePostModel = async (params) => {
    const { reference } = params;
    const deposit = await prisma.company_deposit_request_table.findFirst({
        where: {
            company_deposit_request_account: reference,
        },
    });
    return deposit ? true : false;
};
export const depositReportPostModel = async (params) => {
    const { dateFilter } = params;
    const cacheKey = `deposit-report-${dateFilter.year}-${dateFilter.month}`;
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
        return cachedData;
    }
    const monthYearString = `${dateFilter.year}-${dateFilter.month}-01`;
    let startDate = parseISO(monthYearString);
    startDate = setHours(startDate, 0);
    startDate = setMinutes(startDate, 0);
    startDate = setSeconds(startDate, 0);
    startDate = setMilliseconds(startDate, 0);
    let endDate = endOfDay(new Date());
    const selectedMonth = parseISO(monthYearString);
    const today = new Date();
    // If the selected month is not the current month, set the end date to the last day of the selected month
    if (selectedMonth.getMonth() !== today.getMonth() ||
        selectedMonth.getFullYear() !== today.getFullYear()) {
        endDate = endOfDay(selectedMonth); // End of the selected month
        endDate = endOfMonth(endDate);
    }
    startDate = setDate(startDate, 1);
    const depositMonthlyReport = await prisma.company_deposit_request_table.aggregate({
        _sum: {
            company_deposit_request_amount: true,
        },
        where: {
            company_deposit_request_date_updated: {
                gte: getPhilippinesTime(startDate, "start"),
                lte: getPhilippinesTime(endDate, "end"),
            },
            company_deposit_request_status: "APPROVED",
        },
        _count: {
            company_deposit_request_id: true,
        },
    });
    const depositDailyIncome = await prisma.$queryRaw `
    SELECT
      DATE_TRUNC('day', company_deposit_request_date_updated) AS date,
      SUM(company_deposit_request_amount) AS amount
    FROM company_schema.company_deposit_request_table
    WHERE company_deposit_request_date_updated::Date BETWEEN ${startDate.toISOString().split("T")[0]}::Date AND ${endDate.toISOString().split("T")[0]}::Date
    AND company_deposit_request_status = 'APPROVED'
    GROUP BY date
    ORDER BY date DESC;
  `;
    const returnData = {
        monthlyTotal: depositMonthlyReport._sum.company_deposit_request_amount || 0,
        monthlyCount: depositMonthlyReport._count.company_deposit_request_id || 0,
        dailyIncome: depositDailyIncome,
    };
    await redis.set(cacheKey, JSON.stringify(returnData), {
        ex: 60 * 5,
    });
    return returnData;
};
export const depositUserGetModel = async (params) => {
    const { company_member_id } = params;
    const existingDeposit = await prisma.company_deposit_request_table.findFirst({
        where: {
            company_deposit_request_member_id: company_member_id,
            company_deposit_request_status: "PENDING",
        },
        take: 1,
        orderBy: {
            company_deposit_request_date: "desc",
        },
        select: {
            company_deposit_request_id: true,
        },
    });
    const data = existingDeposit !== null;
    return data;
};
