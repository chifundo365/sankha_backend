import { shopRatingService } from "../services/shopRating.service";

class ShopRatingAggregationJob {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private intervalMs: number;

  constructor(intervalHours = 24) {
    this.intervalMs = intervalHours * 60 * 60 * 1000;
  }

  start() {
    if (this.intervalId) {
      console.log("Shop rating aggregation job is already running");
      return;
    }

    console.log("🔄 Starting shop rating aggregation job...");
    this.runJob();

    this.intervalId = setInterval(() => {
      this.runJob();
    }, this.intervalMs);

    console.log(`✅ Shop rating aggregation job started (runs every ${this.intervalMs / 3600000} hours)`);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("⏹️  Shop rating aggregation job stopped");
    }
  }

  async runJob() {
    if (this.isRunning) {
      console.log("Shop rating aggregation job already in progress, skipping...");
      return;
    }

    this.isRunning = true;
    console.log("Background job started: refreshing shop rating aggregates...");

    try {
      const count = await shopRatingService.refreshAllShopRatings();
      console.log(`Shop rating aggregation job finished, refreshed ${count} shops`);
    } catch (error) {
      console.error("Error in shop rating aggregation job:", error);
    } finally {
      this.isRunning = false;
    }
  }
}

export const shopRatingAggregationJob = new ShopRatingAggregationJob(Number(process.env.SHOP_RATING_AGGREGATION_INTERVAL_HOURS || 24));
