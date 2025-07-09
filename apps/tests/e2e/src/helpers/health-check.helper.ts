export const waitForHealthyServices = async (maxAttempts = 30, delay = 500): Promise<void> => {
  const services = [
    `${process.env.DMR_SERVER_1_URL}/v1/health`, // DMR Server 1
    `${process.env.DMR_AGENT_A_URL}/v1/health`, // DMR Agent A
    `${process.env.DMR_AGENT_B_URL}/v1/health`, // DMR Agent B
  ];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await Promise.all(
        services.map(async (url) => {
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`Service ${url} is not healthy`);
          }
        }),
      );
      return;
    } catch (error) {
      if (attempt === maxAttempts - 1) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};
