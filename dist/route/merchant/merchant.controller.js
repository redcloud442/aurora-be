import { invalidateCache, sendErrorResponse } from "../../utils/function.js";
import { merchantBalanceModel, merchantBankModel, merchantDeleteModel, merchantGetModel, merchantPatchModel, merchantPostModel, } from "./merchant.model.js";
export const merchantGetController = async (c) => {
    try {
        const merchant = await merchantGetModel();
        return c.json({ data: merchant });
    }
    catch (error) {
        return sendErrorResponse("Internal Server Error", 500);
    }
};
export const merchantDeleteController = async (c) => {
    try {
        const { merchantId } = await c.req.json();
        await merchantDeleteModel({ merchantId });
        await invalidateCache(`merchant-get-model`);
        return c.json({ message: "Merchant Deleted" });
    }
    catch (error) {
        return sendErrorResponse("Internal Server Error", 500);
    }
};
export const merchantPostController = async (c) => {
    try {
        const { accountNumber, accountType, accountName, merchantQrAttachment } = await c.req.json();
        const data = await merchantPostModel({
            accountNumber,
            accountType,
            accountName,
            merchantQrAttachment,
        });
        await invalidateCache(`merchant-get-model`);
        return c.json({ message: "Merchant Created", data }, 200);
    }
    catch (error) {
        return sendErrorResponse("Internal Server Error", 500);
    }
};
export const merchantPatchController = async (c) => {
    try {
        const params = c.get("params");
        await merchantPatchModel(params);
        return c.json({ message: "Merchant Updated" });
    }
    catch (error) {
        return sendErrorResponse("Internal Server Error", 500);
    }
};
export const merchantBankController = async (c) => {
    try {
        const params = c.get("params");
        const data = await merchantBankModel(params);
        return c.json({ data });
    }
    catch (error) {
        return sendErrorResponse("Internal Server Error", 500);
    }
};
export const merchantBalanceController = async (c) => {
    try {
        const params = c.get("params");
        const data = await merchantBalanceModel(params);
        return c.json(data, 200);
    }
    catch (error) {
        return sendErrorResponse("Internal Server Error", 500);
    }
};
