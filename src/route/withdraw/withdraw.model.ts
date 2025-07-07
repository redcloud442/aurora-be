import { Prisma, type company_member_table } from "@prisma/client";
import {
  calculateFee,
  calculateFinalAmount,
  getPhilippinesTime,
} from "../../utils/function.js";
import prisma from "../../utils/prisma.js";
import { redis } from "../../utils/redis.js";
import type {
  WithdrawalRequestData,
  WithdrawReturnDataType,
} from "../../utils/types.js";

export const withdrawModel = async (params: {
  earnings: string;
  accountNumber: string;
  selectedEarnings: string;
  accountName: string;
  amount: number;
  bank: string;
  teamMemberProfile: company_member_table;
}) => {
  const {
    earnings,
    accountNumber,
    accountName,
    amount,
    bank,
    teamMemberProfile,
  } = params;

  await prisma.$transaction(async (tx) => {
    const startDate = getPhilippinesTime(new Date(), "start");

    const endDate = getPhilippinesTime(new Date(), "end");

    const existingPackageWithdrawal =
      await tx.company_withdrawal_request_table.findFirst({
        where: {
          company_withdrawal_request_member_id:
            teamMemberProfile.company_member_id,
          company_withdrawal_request_status: {
            in: ["PENDING", "APPROVED"],
          },
          company_withdrawal_request_withdraw_type: earnings,
          company_withdrawal_request_date: {
            gte: getPhilippinesTime(new Date(new Date()), "start"),
            lte: getPhilippinesTime(new Date(new Date()), "end"),
          },
        },
      });

    if (existingPackageWithdrawal) {
      throw new Error(
        `You have already made a ${existingPackageWithdrawal.company_withdrawal_request_withdraw_type} withdrawal today. Please try again tomorrow.`
      );
    }

    const amountMatch = await tx.$queryRaw<
      {
        company_combined_earnings: number;
        company_member_wallet: number;
        company_package_earnings: number;
        company_referral_earnings: number;
      }[]
    >`SELECT 
company_combined_earnings,
company_member_wallet,
company_package_earnings,
company_referral_earnings
FROM company_schema.company_earnings_table 
WHERE company_earnings_member_id = ${teamMemberProfile.company_member_id}::uuid 
FOR UPDATE`;

    if (!amountMatch[0]) {
      throw new Error("Invalid request.");
    }

    const { company_package_earnings, company_referral_earnings } =
      amountMatch[0];

    const amountValue = Math.round(Number(amount) * 100) / 100;

    const earningsType =
      earnings === "PACKAGE"
        ? "company_package_earnings"
        : "company_referral_earnings";

    const earningsValue =
      Math.round(Number(amountMatch[0][earningsType]) * 100) / 100;

    if (amountValue > earningsValue) {
      throw new Error("Insufficient balance.");
    }

    let remainingAmount = Number(amount);

    if (earnings === "PACKAGE") {
      const olympusDeduction = Math.min(
        remainingAmount,
        Number(company_package_earnings)
      );

      remainingAmount -= olympusDeduction;
    }

    if (earnings === "REFERRAL") {
      const referralDeduction = Math.min(
        remainingAmount,
        Number(company_referral_earnings)
      );
      remainingAmount -= referralDeduction;
    }

    const finalAmount = calculateFinalAmount(Number(amount), earnings);
    const fee = calculateFee(Number(amount), earnings);
    const countAllRequests: {
      approverId: string;
      requestCount: bigint;
    }[] = await tx.$queryRaw`
      SELECT am.company_member_id AS "approverId",
             COALESCE(approvedRequests."requestCount", 0) AS "requestCount"
      FROM company_schema.company_member_table am
      LEFT JOIN (
        SELECT cwr.company_withdrawal_request_approved_by AS "approverId",
               COUNT(cwr.company_withdrawal_request_id) AS "requestCount"
        FROM company_schema.company_withdrawal_request_table cwr
        WHERE cwr.company_withdrawal_request_date::timestamptz BETWEEN ${startDate}::timestamptz AND ${endDate}::timestamptz
        GROUP BY cwr.company_withdrawal_request_approved_by
      ) approvedRequests ON am.company_member_id = approvedRequests."approverId"
      WHERE am.company_member_role = 'ACCOUNTING'
      ORDER BY "requestCount" ASC
      LIMIT 1;
    `;

    await tx.company_withdrawal_request_table.create({
      data: {
        company_withdrawal_request_amount: Number(amount),
        company_withdrawal_request_type: bank,
        company_withdrawal_request_account: accountNumber,
        company_withdrawal_request_fee: fee,
        company_withdrawal_request_withdraw_amount: finalAmount,
        company_withdrawal_request_bank_name: accountName,
        company_withdrawal_request_status: "PENDING",
        company_withdrawal_request_member_id:
          teamMemberProfile.company_member_id,
        company_withdrawal_request_withdraw_type: earnings,
        company_withdrawal_request_approved_by:
          countAllRequests[0]?.approverId ?? null,
      },
    });

    // Update the earnings
    await tx.$executeRaw(
      Prisma.sql`
        UPDATE company_schema.company_earnings_table
        SET 
          ${Prisma.raw(earningsType)} = GREATEST(0, ${Prisma.raw(
        earningsType
      )} - ${Math.trunc(Number(amount) * 100) / 100}),
          company_combined_earnings = GREATEST(0, company_combined_earnings - ${
            Math.trunc(Number(amount) * 100) / 100
          })
        WHERE company_earnings_member_id = ${
          teamMemberProfile.company_member_id
        }::uuid;
      `
    );
    // Log the transaction
    await tx.company_transaction_table.create({
      data: {
        company_transaction_amount: finalAmount,
        company_transaction_description: `${
          earnings === "PACKAGE" ? "Trading" : "Referral & Matrix"
        } Ongoing.`,
        company_transaction_details: `Account Name: ${accountName}, Account Number: ${accountNumber}`,
        company_transaction_member_id: teamMemberProfile.company_member_id,
        company_transaction_type: "WITHDRAWAL",
      },
    });
  });
};

export const withdrawHistoryModel = async (
  params: {
    page: number;
    limit: number;
    search: string;
    columnAccessor: string;
    isAscendingSort: boolean;
    userId: string;
  },
  teamMemberProfile: company_member_table
) => {
  const { page, limit, search, columnAccessor, isAscendingSort, userId } =
    params;

  const offset = (page - 1) * limit;
  const sortBy = isAscendingSort ? "ASC" : "DESC";

  const orderBy = columnAccessor
    ? Prisma.sql`ORDER BY ${Prisma.raw(columnAccessor)} ${Prisma.raw(sortBy)}`
    : Prisma.empty;

  const commonConditions: Prisma.Sql[] = [
    Prisma.raw(
      `m.company_member_company_id = '${teamMemberProfile.company_member_company_id}'::uuid AND m.company_member_id = '${userId}'::uuid`
    ),
  ];

  if (search) {
    commonConditions.push(
      Prisma.raw(
        `(
            u.user_username ILIKE '%${search}%'
            OR u.user_id::TEXT ILIKE '%${search}%'
            OR u.user_first_name ILIKE '%${search}%'
            OR u.user_last_name ILIKE '%${search}%'
          )`
      )
    );
  }

  const dataQueryConditions = [...commonConditions];

  const dataWhereClause = Prisma.sql`${Prisma.join(
    dataQueryConditions,
    " AND "
  )}`;

  const withdrawals: WithdrawalRequestData[] = await prisma.$queryRaw`
      SELECT 
        u.user_first_name,
        u.user_last_name,
        u.user_email,
        m.company_member_id,
        t.*
      FROM company_schema.company_withdrawal_request_table t
      JOIN company_schema.company_member_table m 
        ON t.company_withdrawal_request_member_id = m.company_member_id
      JOIN user_schema.user_table u 
        ON u.user_id = m.company_member_user_id
      WHERE ${dataWhereClause}
      ${orderBy}
      LIMIT ${Prisma.raw(limit.toString())}
      OFFSET ${Prisma.raw(offset.toString())}
    `;

  const totalCount: { count: bigint }[] = await prisma.$queryRaw`
        SELECT 
          COUNT(*) AS count
        FROM company_schema.company_withdrawal_request_table t
        JOIN company_schema.company_member_table m 
          ON t.company_withdrawal_request_member_id = m.company_member_id
        JOIN user_schema.user_table u 
        ON u.user_id = m.company_member_user_id
      WHERE ${dataWhereClause}
    `;

  return { data: withdrawals, totalCount: Number(totalCount[0].count) };
};

export const updateWithdrawModel = async (params: {
  status: string;
  note: string;
  requestId: string;
  teamMemberProfile: company_member_table;
}) => {
  const { status, note, requestId, teamMemberProfile } = params;

  const result = await prisma.$transaction(async (tx) => {
    const existingRequest =
      await tx.company_withdrawal_request_table.findUnique({
        where: { company_withdrawal_request_id: requestId },
      });

    if (!existingRequest) {
      throw new Error("Request not found.");
    }

    if (existingRequest.company_withdrawal_request_status !== "PENDING") {
      throw new Error("Request has already been processed.");
    }

    if (
      teamMemberProfile.company_member_id !==
        existingRequest.company_withdrawal_request_approved_by &&
      teamMemberProfile.company_member_role === "ACCOUNTING"
    ) {
      throw new Error("You are not authorized to update this request.");
    }

    const updatedRequest = await tx.company_withdrawal_request_table.update({
      where: { company_withdrawal_request_id: requestId },
      data: {
        company_withdrawal_request_status: status,
        company_withdrawal_request_approved_by:
          teamMemberProfile.company_member_role === "ADMIN"
            ? teamMemberProfile.company_member_id
            : undefined,
        company_withdrawal_request_reject_note: note ?? null,
        company_withdrawal_request_date_updated: new Date(),
      },
    });

    if (status === "REJECTED") {
      const earningsType =
        updatedRequest.company_withdrawal_request_withdraw_type === "PACKAGE"
          ? "company_package_earnings"
          : "company_referral_earnings";

      await tx.company_earnings_table.update({
        where: {
          company_earnings_member_id:
            updatedRequest.company_withdrawal_request_member_id,
        },
        data: {
          [earningsType]: {
            increment: updatedRequest.company_withdrawal_request_amount,
          },
          company_combined_earnings: {
            increment: updatedRequest.company_withdrawal_request_amount,
          },
        },
      });
    }

    await tx.company_transaction_table.create({
      data: {
        company_transaction_description:
          status.slice(0, 1).toUpperCase() + status.slice(1).toLowerCase(),
        company_transaction_details: `${
          note
            ? `${note}`
            : `Account Name: ${updatedRequest.company_withdrawal_request_bank_name}, Account Number: ${updatedRequest.company_withdrawal_request_account}`
        }`,
        company_transaction_amount:
          status === "APPROVED"
            ? updatedRequest.company_withdrawal_request_withdraw_amount
            : updatedRequest.company_withdrawal_request_amount,
        company_transaction_member_id:
          updatedRequest.company_withdrawal_request_member_id,
        company_transaction_type: "WITHDRAWAL",
      },
    });

    return updatedRequest;
  });

  return result;
};

export const withdrawListPostModel = async (params: {
  parameters: {
    page: number;
    limit: number;
    search?: string;
    columnAccessor: string;
    userFilter?: string;
    statusFilter: string;
    isAscendingSort: boolean;
    dateFilter?: {
      start: string;
      end: string;
    };
    showHiddenUser: boolean;
    showAllDays: boolean;
  };
  teamMemberProfile: company_member_table;
}) => {
  const { parameters, teamMemberProfile } = params;

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const philippinesTimeStart = getPhilippinesTime(oneDayAgo, "start");
  const philippinesTimeEnd = getPhilippinesTime(oneDayAgo, "end");

  let returnData: WithdrawReturnDataType = {
    data: {
      APPROVED: { data: [], count: BigInt(0) },
      REJECTED: { data: [], count: BigInt(0) },
      PENDING: { data: [], count: BigInt(0) },
    },
    totalCount: BigInt(0),
    totalPendingWithdrawal: 0,
    totalApprovedWithdrawal: 0,
  };

  const {
    page,
    limit,
    search,
    columnAccessor,
    userFilter,
    statusFilter,
    isAscendingSort,
    dateFilter,
    showHiddenUser,
    showAllDays,
  } = parameters;

  const offset = (page - 1) * limit;
  const sortBy = isAscendingSort ? "DESC" : "ASC";

  const orderBy = columnAccessor
    ? Prisma.sql`ORDER BY ${Prisma.raw(columnAccessor)} ${Prisma.raw(sortBy)}`
    : Prisma.empty;

  const commonConditions: Prisma.Sql[] = [
    Prisma.raw(
      `m.company_member_company_id = '${
        teamMemberProfile.company_member_company_id
      }'::uuid AND t.company_withdrawal_request_member_id ${
        showHiddenUser ? "IN" : "NOT IN"
      } (SELECT company_hidden_user_member_id FROM company_schema.company_hidden_user_table)`
    ),
  ];

  if (!showAllDays && !dateFilter?.start && !dateFilter?.end) {
    commonConditions.push(
      Prisma.raw(
        `t.company_withdrawal_request_date::timestamptz BETWEEN '${philippinesTimeStart}'::timestamptz AND '${philippinesTimeEnd}'::timestamptz`
      )
    );
  }

  if (teamMemberProfile.company_member_role === "ACCOUNTING") {
    commonConditions.push(
      Prisma.raw(
        `t.company_withdrawal_request_approved_by = '${teamMemberProfile.company_member_id}'::uuid`
      )
    );
  }

  if (userFilter) {
    commonConditions.push(Prisma.raw(`u.user_id::TEXT = '${userFilter}'`));
  }

  if (dateFilter?.start && dateFilter?.end) {
    const startDate = getPhilippinesTime(
      new Date(dateFilter.start || new Date()),
      "start"
    );

    const endDate = getPhilippinesTime(
      new Date(dateFilter.end || new Date()),
      "end"
    );

    commonConditions.push(
      Prisma.raw(
        `t.company_withdrawal_request_date_updated::timestamptz BETWEEN '${startDate}'::timestamptz AND '${endDate}'::timestamptz`
      )
    );
  }

  if (search) {
    commonConditions.push(
      Prisma.raw(
        `(
          u.user_username ILIKE '%${search}%'
          OR u.user_id::TEXT ILIKE '%${search}%'
          OR u.user_first_name ILIKE '%${search}%'
          OR u.user_last_name ILIKE '%${search}%'
        )`
      )
    );
  }

  const dataQueryConditions = [...commonConditions];

  if (statusFilter) {
    dataQueryConditions.push(
      Prisma.raw(`t.company_withdrawal_request_status = '${statusFilter}'`)
    );
  }

  const dataWhereClause = Prisma.sql`${Prisma.join(
    dataQueryConditions,
    " AND "
  )}`;

  const countWhereClause = Prisma.sql`${Prisma.join(
    commonConditions,
    " AND "
  )}`;

  const withdrawals: WithdrawalRequestData[] = await prisma.$queryRaw`
    SELECT 
      u.user_id,
      u.user_email,
      u.user_username,
      m.company_member_id,
      t.*,
      approver.user_username AS approver_username
    FROM company_schema.company_withdrawal_request_table t
    JOIN company_schema.company_member_table m 
      ON t.company_withdrawal_request_member_id = m.company_member_id
    JOIN user_schema.user_table u 
      ON u.user_id = m.company_member_user_id
    LEFT JOIN company_schema.company_member_table mt 
      ON mt.company_member_id = t.company_withdrawal_request_approved_by
    LEFT JOIN user_schema.user_table approver 
      ON approver.user_id = mt.company_member_user_id
    WHERE ${dataWhereClause}
    ${orderBy}
    LIMIT ${Prisma.raw(limit.toString())}
    OFFSET ${Prisma.raw(offset.toString())}
  `;

  const statusCounts: { status: string; count: bigint }[] =
    await prisma.$queryRaw`
      SELECT 
        t.company_withdrawal_request_status AS status, 
        COUNT(*) AS count
      FROM company_schema.company_withdrawal_request_table t
      JOIN company_schema.company_member_table m 
        ON t.company_withdrawal_request_member_id = m.company_member_id
      JOIN user_schema.user_table u 
        ON u.user_id = m.company_member_user_id
      LEFT JOIN company_schema.company_member_table mt 
        ON mt.company_member_id = t.company_withdrawal_request_approved_by
      LEFT JOIN user_schema.user_table approver 
        ON approver.user_id = mt.company_member_user_id
      WHERE ${countWhereClause}
      GROUP BY t.company_withdrawal_request_status
    `;

  const startDate =
    dateFilter?.start && dateFilter?.end
      ? getPhilippinesTime(new Date(dateFilter.start), "start")
      : undefined;
  const endDate =
    dateFilter?.end && dateFilter?.start
      ? getPhilippinesTime(new Date(dateFilter.end), "end")
      : undefined;

  if (
    teamMemberProfile.company_member_role === "ACCOUNTING_HEAD" ||
    teamMemberProfile.company_member_role === "ADMIN"
  ) {
    const totalApprovedWithdrawal =
      await prisma.company_withdrawal_request_table.aggregate({
        where: {
          company_withdrawal_request_status: "APPROVED",
          company_withdrawal_request_date_updated: {
            gte: startDate,
            lte: endDate,
          },
        },
        _sum: {
          company_withdrawal_request_amount: true,
          company_withdrawal_request_fee: true,
        },
      });

    returnData.totalApprovedWithdrawal =
      Number(totalApprovedWithdrawal._sum.company_withdrawal_request_amount) -
      Number(totalApprovedWithdrawal._sum.company_withdrawal_request_fee);
  }

  const totalPendingWithdrawal =
    await prisma.company_withdrawal_request_table.aggregate({
      where: {
        company_withdrawal_request_status: "PENDING",
        company_withdrawal_request_approved_by:
          teamMemberProfile.company_member_role === "ACCOUNTING"
            ? teamMemberProfile.company_member_id
            : undefined,
        company_withdrawal_request_date: {
          gte: startDate,
          lte: endDate,
        },
      },
      _sum: {
        company_withdrawal_request_amount: true,
        company_withdrawal_request_fee: true,
      },
    });

  returnData.totalPendingWithdrawal =
    Number(totalPendingWithdrawal._sum.company_withdrawal_request_amount) -
    Number(totalPendingWithdrawal._sum.company_withdrawal_request_fee);
  ["APPROVED", "REJECTED", "PENDING"].forEach((status) => {
    const match = statusCounts.find((item) => item.status === status);
    returnData.data[status as keyof typeof returnData.data].count = match
      ? BigInt(match.count)
      : BigInt(0);
  });

  withdrawals.forEach((request) => {
    const status = request.company_withdrawal_request_status;
    if (returnData.data[status as keyof typeof returnData.data]) {
      returnData.data[status as keyof typeof returnData.data].data.push(
        request
      );
    }
  });

  returnData.totalCount = statusCounts.reduce(
    (sum, item) => sum + BigInt(item.count),
    BigInt(0)
  );

  return JSON.parse(
    JSON.stringify(returnData, (key, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
  );
};

export const withdrawHistoryReportPostTotalModel = async (params: {
  take: number;
  skip: number;
  type: string;
}) => {
  const { take, skip, type } = params;

  // Helper function to adjust the date based on the type and skip count
  const adjustDate = (date: Date, type: string, skip: number): Date => {
    const adjustedDate = new Date(date);
    switch (type) {
      case "DAILY":
        adjustedDate.setDate(adjustedDate.getDate() - skip);
        break;
      case "WEEKLY":
        adjustedDate.setDate(adjustedDate.getDate() - 7 * skip);
        break;
      case "MONTHLY":
        adjustedDate.setMonth(adjustedDate.getMonth() - skip);
        adjustedDate.setDate(1); // Set to the first day of the month
        break;
      default:
        throw new Error("Invalid type provided");
    }
    return adjustedDate;
  };

  const generateIntervals = (type: string, take: number, currentEnd: Date) => {
    const intervals = [];
    for (let i = 0; i < take; i++) {
      const intervalEnd = new Date(currentEnd);
      let intervalStart = new Date(currentEnd);

      switch (type) {
        case "DAILY":
          intervalStart.setDate(intervalStart.getDate() - 1); // Shift back one full day
          break;
        case "WEEKLY":
          intervalStart.setDate(intervalStart.getDate() - 8);
          break;
        case "MONTHLY":
          intervalStart.setMonth(intervalStart.getMonth() - 1);
          intervalStart.setDate(1);
          break;
      }

      intervalStart.setUTCHours(16, 1, 1, 1); // 12:01:01 AM PH Time (UTC+8)
      intervalEnd.setUTCHours(15, 59, 59, 999); // 11:59:59.999 PM PH Time (UTC+8)

      intervals.push({
        start: intervalStart.toISOString(),
        end: intervalEnd.toISOString(),
      });

      // Move `currentEnd` backward for the next iteration
      switch (type) {
        case "DAILY":
          currentEnd.setDate(currentEnd.getDate() - 1);
          break;
        case "WEEKLY":
          currentEnd.setDate(currentEnd.getDate() - 7);
          break;
        case "MONTHLY":
          currentEnd.setMonth(currentEnd.getMonth() - 1);
          currentEnd.setDate(1);
          break;
      }
      currentEnd.setUTCHours(15, 59, 59, 999); // Maintain PH Time format
    }
    return intervals;
  };

  // Helper function to execute the query for each interval
  const executeQuery = async (interval: { start: Date; end: Date }) => {
    const reportData: {
      interval_start: string;
      interval_end: string;
      total_accounting_approvals: number;
      total_admin_approvals: number;
      total_admin_approved_amount: number;
      total_accounting_approved_amount: number;
      total_net_approved_amount: number;
    }[] = await prisma.$queryRaw`
      WITH approval_summary AS (
        SELECT 
          t.company_withdrawal_request_id,
          CASE 
            WHEN mr.company_member_role = 'ADMIN' THEN 'ADMIN'
            WHEN mt.company_member_role = 'ACCOUNTING' THEN 'ACCOUNTING'
          END AS approver_role,
          t.company_withdrawal_request_amount - t.company_withdrawal_request_fee AS net_approved_amount
        FROM company_schema.company_withdrawal_request_table t
        LEFT JOIN company_schema.company_member_table mt 
          ON mt.company_member_id = t.company_withdrawal_request_approved_by
          AND mt.company_member_role = 'ACCOUNTING'
        LEFT JOIN company_schema.company_member_table mr 
          ON mr.company_member_id = t.company_withdrawal_request_approved_by
          AND mr.company_member_role = 'ADMIN'
        WHERE t.company_withdrawal_request_date_updated::timestamptz BETWEEN ${interval.start}::timestamptz AND ${interval.end}::timestamptz
          AND t.company_withdrawal_request_status = 'APPROVED'
      ),
      role_aggregates AS (
        SELECT 
          approver_role,
          COUNT(*) AS total_approvals,
          SUM(net_approved_amount) AS total_approved_amount
        FROM approval_summary
        GROUP BY approver_role
      )

      SELECT 
        ${interval.start} AS interval_start,
        ${interval.end} AS interval_end,
        COALESCE((SELECT total_approvals FROM role_aggregates WHERE approver_role = 'ACCOUNTING'), 0) AS total_accounting_approvals,
        COALESCE((SELECT total_approvals FROM role_aggregates WHERE approver_role = 'ADMIN'), 0) AS total_admin_approvals,
        COALESCE((SELECT total_approved_amount FROM role_aggregates WHERE approver_role = 'ADMIN'), 0) AS total_admin_approved_amount,
        COALESCE((SELECT total_approved_amount FROM role_aggregates WHERE approver_role = 'ACCOUNTING'), 0) AS total_accounting_approved_amount,
        COALESCE((SELECT SUM(net_approved_amount) FROM approval_summary), 0) AS total_net_approved_amount
    `;

    return (
      reportData[0] || {
        interval_start: interval.start,
        interval_end: interval.end,
        total_accounting_approvals: 0,
        total_admin_approvals: 0,
        total_admin_approved_amount: 0,
        total_accounting_approved_amount: 0,
        total_net_approved_amount: 0,
      }
    );
  };

  // Main logic
  let currentEnd = new Date();
  currentEnd.setDate(currentEnd.getDate() + 1);
  currentEnd.setUTCHours(23, 59, 59, 999); // Set time to 11:59:59.999 PM

  currentEnd = adjustDate(currentEnd, type, skip);
  const intervals = generateIntervals(type, take, currentEnd);

  const aggregatedResults = await Promise.all(
    intervals.map((interval) =>
      executeQuery({
        start: new Date(interval.start),
        end: new Date(interval.end),
      })
    )
  );

  return JSON.parse(
    JSON.stringify(aggregatedResults, (key, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
  );
};

export const withdrawHistoryReportPostModel = async (params: {
  dateFilter: {
    startDate: string;
    endDate: string;
  };
}) => {
  const { dateFilter } = params;

  const { startDate, endDate } = dateFilter;
  const cacheKey = `withdrawal-report-${startDate}-${endDate}`;

  const cachedData = await redis.get(cacheKey);

  if (cachedData) {
    return cachedData as {
      total_request: number;
      total_amount: number;
    };
  }

  const withdrawalData =
    await prisma.company_withdrawal_request_table.aggregate({
      where: {
        company_withdrawal_request_date: {
          gte: dateFilter.startDate
            ? getPhilippinesTime(new Date(startDate), "start")
            : undefined,
          lte: dateFilter.endDate
            ? getPhilippinesTime(new Date(endDate), "end")
            : undefined,
        },
        company_withdrawal_request_status: "APPROVED",
      },

      _count: true,
      _sum: {
        company_withdrawal_request_amount: true,
        company_withdrawal_request_fee: true,
      },
    });

  const returnData = {
    total_request: withdrawalData._count,
    total_amount:
      (withdrawalData._sum.company_withdrawal_request_amount || 0) -
      (withdrawalData._sum.company_withdrawal_request_fee || 0),
  };

  await redis.set(cacheKey, JSON.stringify(returnData), {
    ex: 60 * 5,
  });

  return returnData;
};

export const withdrawHideUserModel = async (params: {
  id: string;
  type: "add" | "remove";
  teamMemberProfile: company_member_table;
}) => {
  const { id, type, teamMemberProfile } = params;

  if (type === "add") {
    await prisma.company_hidden_user_table.create({
      data: {
        company_hidden_user_member_id: id,
        company_hidden_user_action_by: teamMemberProfile.company_member_id,
      },
    });
  } else if (type === "remove") {
    await prisma.company_hidden_user_table.delete({
      where: {
        company_hidden_user_member_id: id,
      },
    });
  }
};

export const withdrawUserGetModel = async (params: {
  teamMemberProfile: company_member_table;
}) => {
  const { teamMemberProfile } = params;

  const now = new Date();
  const todayStart = getPhilippinesTime(now, "start");
  const todayEnd = getPhilippinesTime(now, "end");

  const [packageWithdrawal, referralWithdrawal] = await Promise.all([
    prisma.company_withdrawal_request_table.findFirst({
      where: {
        company_withdrawal_request_member_id:
          teamMemberProfile.company_member_id,
        company_withdrawal_request_status: { in: ["PENDING", "APPROVED"] },
        company_withdrawal_request_withdraw_type: "PACKAGE",
        company_withdrawal_request_date: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
      select: {
        company_withdrawal_request_id: true,
      },
    }),
    prisma.company_withdrawal_request_table.findFirst({
      where: {
        company_withdrawal_request_member_id:
          teamMemberProfile.company_member_id,
        company_withdrawal_request_status: { in: ["PENDING", "APPROVED"] },
        company_withdrawal_request_withdraw_type: "REFERRAL",
        company_withdrawal_request_date: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
      select: {
        company_withdrawal_request_id: true,
      },
    }),
  ]);

  return {
    packageWithdrawal: packageWithdrawal !== null,
    referralWithdrawal: referralWithdrawal !== null,
  };
};
