const axios = require('axios');
const { ServiceError } = require('../errors/CustomErrors');

class RetryableHttpClient {
  constructor(eventBus, serviceName, config = {}) {
    this.eventBus = eventBus;
    this.serviceName = serviceName;
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000;
    this.maxRetryDelay = config.maxRetryDelay || 30000;

    this.client = axios.create({
      timeout: config.timeout || 10000,
      ...config
    });

    this.setupInterceptors();
  }

  setupInterceptors() {
    this.client.interceptors.response.use(
      response => response,
      async (error) => {
        const config = error.config;
        if (!config || !config.retry) {
          return Promise.reject(error);
        }

        config.retryCount = config.retryCount || 0;

        if (config.retryCount >= this.maxRetries) {
          this.eventBus.emit('system.service.error', {
            service: this.serviceName,
            error: new ServiceError(
              `Max retries (${this.maxRetries}) exceeded`,
              error,
              this.serviceName
            ),
            context: { url: config.url, method: config.method }
          });
          return Promise.reject(error);
        }

        if (!this.isRetryableError(error)) {
          return Promise.reject(error);
        }

        const delay = Math.min(
          this.retryDelay * Math.pow(2, config.retryCount),
          this.maxRetryDelay
        );

        console.log(`[${this.serviceName}] Retry ${config.retryCount + 1}/${this.maxRetries} in ${delay}ms`);
        await this.sleep(delay);

        config.retryCount++;
        return this.client(config);
      }
    );
  }

  isRetryableError(error) {
    if (!error.response) return true;
    return error.response.status >= 500 || error.response.status === 429;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  attachRetryConfig(config) {
    return { ...config, retry: true, retryCount: 0 };
  }

  async get(url, config = {}) {
    try {
      const response = await this.client.get(url, this.attachRetryConfig(config));
      return response.data;
    } catch (error) {
      throw new ServiceError(
        `GET ${url} failed after retries`,
        error,
        this.serviceName
      );
    }
  }

  async post(url, data, config = {}) {
    try {
      const response = await this.client.post(url, data, this.attachRetryConfig(config));
      return response.data;
    } catch (error) {
      throw new ServiceError(
        `POST ${url} failed after retries`,
        error,
        this.serviceName
      );
    }
  }

  async put(url, data, config = {}) {
    try {
      const response = await this.client.put(url, data, this.attachRetryConfig(config));
      return response.data;
    } catch (error) {
      throw new ServiceError(
        `PUT ${url} failed after retries`,
        error,
        this.serviceName
      );
    }
  }
}

module.exports = RetryableHttpClient;
