import { internalQuery } from "../_generated/server";

export const getAllWithCategory = internalQuery({
  args: {},
  handler: async (ctx) => {
    const buildings = await ctx.db.query("buildings").collect();
    return buildings.map((b) => ({
      _id: b._id as string,
      plotIndex: b.plotIndex,
      category: b.category,
      ownerId: b.ownerId,
    }));
  },
});
