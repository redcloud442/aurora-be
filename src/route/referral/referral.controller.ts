import type { Context } from "hono";
import { sendErrorResponse } from "../../utils/function.js";
import {
  referralDirectModelPost,
  referralIndirectModelPost,
  referralTotalGetModel,
} from "./referral.model.js";

export const referralDirectPostController = async (c: Context) => {
  try {
    const { page, limit, search, columnAccessor, isAscendingSort } =
      await c.req.json();

    const teamMemberProfile = c.get("teamMemberProfile");

    const data = await referralDirectModelPost({
      page,
      limit,
      search,
      columnAccessor,
      isAscendingSort,
      teamMemberProfile,
    });

    return c.json(data);
  } catch (error) {
    return sendErrorResponse("Invalid data", 400);
  }
};

export const referralIndirectPostController = async (c: Context) => {
  try {
    const { page, limit, search, columnAccessor, isAscendingSort } =
      await c.req.json();

    const teamMemberProfile = c.get("teamMemberProfile");

    const data = await referralIndirectModelPost({
      page,
      limit,
      search,
      columnAccessor,
      isAscendingSort,
      teamMemberProfile,
    });

    return c.json(data);
  } catch (error) {
    return sendErrorResponse("Invalid data", 400);
  }
};

export const referralTotalGetController = async (c: Context) => {
  try {
    const teamMemberProfile = c.get("teamMemberProfile");

    const { data } = await referralTotalGetModel({ teamMemberProfile });

    return c.json({ message: "Data fetched successfully", data });
  } catch (error) {
    return sendErrorResponse("Internal Server Error", 500);
  }
};
