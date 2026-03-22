import prisma from "../prismaClient";

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export const shopRatingService = {
  async calculateShopRating(shopId: string) {
    // Aggregate review ratings across all products in the shop
    const reviewStats = await prisma.reviews.aggregate({
      where: {
        shop_products: {
          shop_id: shopId
        }
      },
      _avg: { rating: true },
      _count: { rating: true }
    });

    const totalReviews = reviewStats._count.rating ?? 0;
    const avgRating = reviewStats._avg.rating ? Number(Number(reviewStats._avg.rating).toFixed(2)) : 0;

    // Computed metrics for shop_score
    const completedOrdersCount = await prisma.orders.count({
      where: {
        shop_id: shopId,
        status: "DELIVERED"
      }
    });

    const lastDeliveredOrder = await prisma.orders.findFirst({
      where: {
        shop_id: shopId,
        status: "DELIVERED"
      },
      orderBy: { updated_at: "desc" },
      select: { updated_at: true }
    });

    const completedOrdersNormalized = clamp(completedOrdersCount / 100); // caps at 1.0

    let recency = 0;
    if (lastDeliveredOrder && lastDeliveredOrder.updated_at) {
      const now = new Date();
      const last = new Date(lastDeliveredOrder.updated_at as Date);
      const days = (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);
      if (days <= 30) recency = 1;
      else if (days <= 90) recency = 0.6;
      else if (days <= 180) recency = 0.35;
      else recency = 0.15;
    }

    const shop = await prisma.shops.findUnique({
      where: { id: shopId },
      select: { is_verified: true }
    });

    const isVerifiedScore = shop?.is_verified ? 1 : 0;

    const shopScore = Number(
      (
        avgRating * 0.4 +
        isVerifiedScore * 0.2 +
        completedOrdersNormalized * 0.3 +
        recency * 0.1
      ).toFixed(4)
    );

    return {
      avgRating,
      totalReviews,
      shopScore
    };
  },

  async refreshShopRating(shopId: string) {
    const { avgRating, totalReviews, shopScore } = await this.calculateShopRating(shopId);

    await prisma.shops.update({
      where: { id: shopId },
      data: {
        avg_rating: avgRating,
        total_reviews: totalReviews,
        shop_score: shopScore
      }
    });

    return { avgRating, totalReviews, shopScore };
  },

  async refreshAllShopRatings() {
    const shops = await prisma.shops.findMany({ select: { id: true } });
    for (const shop of shops) {
      try {
        await this.refreshShopRating(shop.id);
      } catch (error) {
        console.error(`Failed refreshing rating for shop ${shop.id}:`, error);
      }
    }
    return shops.length;
  }
};
