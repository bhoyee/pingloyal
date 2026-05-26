export const redisConfig = {
  connection: {
    url: process.env.REDIS_URL,
    maxRetriesPerRequest: null, // required for BullMQ
    enableReadyCheck: false, // required for BullMQ
    retryStrategy: (times: number): number | null => {
      if (times > 10) return null;
      return Math.min(times * 1000, 10_000);
    },
    reconnectOnError: (err: Error): boolean => {
      const targetErrors = ['READONLY', 'ECONNRESET', 'ECONNREFUSED'];
      return targetErrors.some((e) => err.message.includes(e));
    },
  },
};
