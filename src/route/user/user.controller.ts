import type { Context } from "hono";
import {
  userActiveListModel,
  userChangePasswordModel,
  userGenerateLinkModel,
  userGetSearchModel,
  userListModel,
  userListReinvestedModel,
  userModelGet,
  userModelPost,
  userModelPut,
  userPatchModel,
  userProfileModelPut,
  userReferralModel,
  userSponsorModel,
  userTreeModel,
} from "./user.model.js";

export const userPutController = async (c: Context) => {
  try {
    const { email, password, userId } = await c.req.json();

    await userModelPut({ email, password, userId });

    return c.json({ message: "User Updated" });
  } catch (error) {
    return c.json({ error: "Internal Server Error" }, { status: 500 });
  }
};

export const userPostController = async (c: Context) => {
  try {
    const { memberId } = await c.req.json();

    const user = await userModelPost({ memberId });

    return c.json(user);
  } catch (error) {
    return c.json({ error: "Internal Server Error" }, { status: 500 });
  }
};

export const userGetController = async (c: Context) => {
  try {
    const teamMemberProfile = c.get("teamMemberProfile");

    const data = await userModelGet({
      memberId: teamMemberProfile.company_member_id,
    });

    return c.json(data, 200);
  } catch (error) {
    return c.json({ error: "Internal Server Error" }, { status: 500 });
  }
};

export const userPatchController = async (c: Context) => {
  try {
    const { action, role, type } = await c.req.json();
    const { id } = c.req.param();

    await userPatchModel({ memberId: id, action, role, type });

    return c.json({ message: "User Updated" });
  } catch (error) {
    return c.json({ error: "Internal Server Error" }, { status: 500 });
  }
};

export const userSponsorController = async (c: Context) => {
  try {
    const { userId } = await c.req.json();

    const data = await userSponsorModel({ userId });

    return c.json(data, { status: 200 });
  } catch (error) {
    return c.json({ error: "Internal Server Error" }, { status: 500 });
  }
};

export const userProfilePutController = async (c: Context) => {
  try {
    const { profilePicture } = await c.req.json();

    const { id } = c.req.param();

    await userProfileModelPut({ profilePicture, userId: id });

    return c.json({ message: "Profile Updated" });
  } catch (error) {
    return c.json({ error: "Internal Server Error" }, { status: 500 });
  }
};

export const userGenerateLinkController = async (c: Context) => {
  try {
    const { formattedUserName } = await c.req.json();

    const data = await userGenerateLinkModel({ formattedUserName });

    return c.json({ url: data });
  } catch (error) {
    return c.json({ error: "Internal Server Error" }, { status: 500 });
  }
};

export const userListController = async (c: Context) => {
  try {
    const params = c.get("params");
    const teamMemberProfile = c.get("teamMemberProfile");

    const { data, totalCount } = await userListModel(params, teamMemberProfile);

    return c.json({ data, totalCount }, 200);
  } catch (error) {
    return c.json({ error: "Internal Server Error" }, { status: 500 });
  }
};

export const userActiveListController = async (c: Context) => {
  try {
    const params = c.get("params");

    const data = await userActiveListModel(params);

    return c.json(data, { status: 200 });
  } catch (error) {
    return c.json({ error: "Internal Server Error" }, { status: 500 });
  }
};

export const userChangePasswordController = async (c: Context) => {
  try {
    const params = c.get("params");

    await userChangePasswordModel(params);

    return c.json({ message: "Password Updated" });
  } catch (error) {
    return c.json({ error: "Internal Server Error" }, { status: 500 });
  }
};

export const userListReinvestedController = async (c: Context) => {
  try {
    const params = c.get("params");

    const data = await userListReinvestedModel(params);

    return c.json(data, 200);
  } catch (error) {
    return c.json({ error: "Internal Server Error" }, { status: 500 });
  }
};

export const userTreeController = async (c: Context) => {
  try {
    const params = c.get("params");

    const data = await userTreeModel(params);

    return c.json(data, 200);
  } catch (error) {
    return c.json({ error: "Internal Server Error" }, { status: 500 });
  }
};

export const userGetSearchController = async (c: Context) => {
  try {
    const params = c.get("params");

    const data = await userGetSearchModel(params);

    return c.json(data, 200);
  } catch (error) {
    return c.json({ error: "Internal Server Error" }, { status: 500 });
  }
};

export const userReferralController = async (c: Context) => {
  try {
    const params = c.get("params");

    const data = await userReferralModel(params);

    return c.json(data, 200);
  } catch (error) {
    return c.json({ error: "Internal Server Error" }, { status: 500 });
  }
};
