import { sendErrorResponse } from "../../utils/function.js";
import { bannerDeleteModel, bannerGetModel, bannerPostModel, bannerPutModel, } from "./banner.model.js";
export const bannerPostController = async (c) => {
    try {
        const { company_promo_image } = c.get("params");
        const banner = await bannerPostModel(company_promo_image);
        return c.json(banner);
    }
    catch (e) {
        return sendErrorResponse("Internal Server Error", 500);
    }
};
export const bannerPutController = async (c) => {
    try {
        const params = c.get("params");
        const banner = await bannerPutModel(params.id, params.company_promo_image);
        return c.json(banner);
    }
    catch (e) {
        return sendErrorResponse("Internal Server Error", 500);
    }
};
export const bannerDeleteController = async (c) => {
    try {
        const params = c.get("params");
        const banner = await bannerDeleteModel(params.id);
        return c.json(banner);
    }
    catch (e) {
        return sendErrorResponse("Internal Server Error", 500);
    }
};
export const bannerGetController = async (c) => {
    try {
        const banner = await bannerGetModel();
        return c.json(banner);
    }
    catch (e) {
        return sendErrorResponse("Internal Server Error", 500);
    }
};
