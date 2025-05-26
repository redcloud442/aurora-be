import { invalidateCache, invalidateCacheVersion, sendErrorResponse, } from "../../utils/function.js";
import { updateWithdrawModel, withdrawHideUserModel, withdrawHistoryModel, withdrawHistoryReportPostModel, withdrawHistoryReportPostTotalModel, withdrawListPostModel, withdrawModel, withdrawUserGetModel, } from "./withdraw.model.js";
export const withdrawPostController = async (c) => {
    try {
        const params = c.get("params");
        const teamMemberProfile = c.get("teamMemberProfile");
        await withdrawModel({
            ...params,
            teamMemberProfile,
        });
        await Promise.all([
            invalidateCacheVersion(`transaction:${teamMemberProfile.company_member_id}:WITHDRAWAL`),
            invalidateCache(`user-model-get-${teamMemberProfile.company_member_id}`),
        ]);
        return c.json({ message: "Withdrawal successful" }, 200);
    }
    catch (e) {
        return sendErrorResponse("Internal Server Error", 500);
    }
};
export const withdrawHistoryPostController = async (c) => {
    try {
        const params = c.get("params");
        const teamMemberProfile = c.get("teamMemberProfile");
        const data = await withdrawHistoryModel(params, teamMemberProfile);
        return c.json(data, 200);
    }
    catch (e) {
        return sendErrorResponse("Internal Server Error", 500);
    }
};
export const updateWithdrawPostController = async (c) => {
    try {
        const { status, note } = await c.req.json();
        const { id } = c.req.param();
        const teamMemberProfile = c.get("teamMemberProfile");
        const data = await updateWithdrawModel({
            status,
            note,
            teamMemberProfile,
            requestId: id,
        });
        await Promise.all([
            invalidateCacheVersion(`transaction:${data?.company_withdrawal_request_member_id}:WITHDRAWAL`),
            invalidateCache(`user-model-get-${data?.company_withdrawal_request_member_id}`),
        ]);
        return c.json({ message: "Withdrawal updated" }, 200);
    }
    catch (e) {
        return sendErrorResponse("Internal Server Error", 500);
    }
};
export const withdrawListPostController = async (c) => {
    try {
        const params = c.get("params");
        const teamMemberProfile = c.get("teamMemberProfile");
        const data = await withdrawListPostModel({
            parameters: params,
            teamMemberProfile,
        });
        return c.json(data, 200);
    }
    catch (e) {
        return sendErrorResponse("Internal Server Error", 500);
    }
};
export const withdrawHistoryReportPostController = async (c) => {
    try {
        const { dateFilter } = await c.req.json();
        const data = await withdrawHistoryReportPostModel({ dateFilter });
        return c.json(data, 200);
    }
    catch (e) {
        return sendErrorResponse("Internal Server Error", 500);
    }
};
export const withdrawTotalReportPostController = async (c) => {
    try {
        const params = c.get("params");
        const data = await withdrawHistoryReportPostTotalModel(params);
        return c.json(data, 200);
    }
    catch (e) {
        return sendErrorResponse("Internal Server Error", 500);
    }
};
export const withdrawHideUserPostController = async (c) => {
    try {
        const params = c.get("params");
        const teamMemberProfile = c.get("teamMemberProfile");
        await withdrawHideUserModel({
            id: params.id,
            type: params.type,
            teamMemberProfile,
        });
        return c.json({ message: "User hidden" }, 200);
    }
    catch (e) {
        return sendErrorResponse("Internal Server Error", 500);
    }
};
export const withdrawUserGetController = async (c) => {
    try {
        const teamMemberProfile = c.get("teamMemberProfile");
        const data = await withdrawUserGetModel({
            teamMemberProfile,
        });
        return c.json(data, 200);
    }
    catch (e) {
        return sendErrorResponse("Internal Server Error", 500);
    }
};
