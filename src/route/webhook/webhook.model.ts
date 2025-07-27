import prisma from "../../utils/prisma.js";

export const MineSweepWebhookModel = async (params: {
  memberId: string;
  amount: number;
}) => {
  const { memberId, amount } = params;

  await prisma.$transaction(async (tx) => {
    const companyEarnings = await tx.company_earnings_table.findFirstOrThrow({
      where: {
        company_earnings_member_id: memberId,
      },
      select: {
        company_earnings_id: true,
      },
    });

    await tx.company_earnings_table.update({
      where: {
        company_earnings_id: companyEarnings.company_earnings_id,
      },
      data: {
        company_member_wallet: {
          increment: amount,
        },
        company_combined_earnings: {
          increment: amount,
        },
      },
    });

    await tx.company_transaction_table.create({
      data: {
        company_transaction_member_id: memberId,
        company_transaction_amount: amount,
        company_transaction_type: "EARNINGS",
        company_transaction_description: "Minesweep Win",
      },
    });
  });
};
