import type { ModuleServer } from "../types.ts";

export const listsServer: ModuleServer = {
  id: "list",
  async load(settings, ctx) {
    const listId = String(settings.listId ?? "");
    if (!listId) return { error: "Pick a list in this widget's settings." };
    const found = await ctx.getList(listId);
    if (!found) return { error: "That list no longer exists." };
    return found;
  },
};
