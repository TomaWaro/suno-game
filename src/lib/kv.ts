import fs from 'fs';
import path from 'path';
import { kv as vercelKv } from '@vercel/kv';
import Redis from 'ioredis';

// Fallback for Upstash Redis variables if Vercel KV is not explicitly named KV
if (process.env.UPSTASH_REDIS_REST_URL && !process.env.KV_REST_API_URL) {
  process.env.KV_REST_API_URL = process.env.UPSTASH_REDIS_REST_URL;
}
if (process.env.UPSTASH_REDIS_REST_TOKEN && !process.env.KV_REST_API_TOKEN) {
  process.env.KV_REST_API_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
}
if (process.env.UPSTASH_REDIS_URL && !process.env.KV_URL) {
  process.env.KV_URL = process.env.UPSTASH_REDIS_URL;
}

// 1. Connection settings detection
const redisUrl = process.env.REDIS_URL || process.env.KV_URL;
export const isTcpRedis = !!(redisUrl && (redisUrl.startsWith('redis://') || redisUrl.startsWith('rediss://')));
const isProdKV = !!process.env.KV_REST_API_URL;
const isVercel = process.env.VERCEL === '1';

// 2. Initialize TCP Redis client
let tcpKvClient: any = null;
if (isTcpRedis) {
  try {
    tcpKvClient = new Redis(redisUrl!);
  } catch (err) {
    console.error('Failed to initialize TCP Redis connection:', err);
  }
}

const tcpKv = {
  async get<T>(key: string): Promise<T | null> {
    if (!tcpKvClient) return null;
    const data = await tcpKvClient.get(key);
    if (!data) return null;
    try {
      return JSON.parse(data) as T;
    } catch {
      return data as unknown as T;
    }
  },
  async set(key: string, value: any, options?: { ex?: number }): Promise<'OK'> {
    if (!tcpKvClient) return 'OK';
    const valStr = typeof value === 'string' ? value : JSON.stringify(value);
    if (options?.ex) {
      await tcpKvClient.set(key, valStr, 'EX', options.ex);
    } else {
      await tcpKvClient.set(key, valStr);
    }
    return 'OK';
  },
  async del(key: string): Promise<number> {
    if (!tcpKvClient) return 0;
    return await tcpKvClient.del(key);
  }
};

// 3. Setup mock filesystem storage
const MOCK_FILE_PATH = path.join(process.cwd(), '.next', 'mock-kv.json');
let inMemoryStore: Record<string, any> = {};

function loadMockData() {
  try {
    if (fs.existsSync(MOCK_FILE_PATH)) {
      const data = fs.readFileSync(MOCK_FILE_PATH, 'utf8');
      inMemoryStore = JSON.parse(data);
    }
  } catch (e) {
    // Local fallback
  }
}

function saveMockData() {
  try {
    const dir = path.dirname(MOCK_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(MOCK_FILE_PATH, JSON.stringify(inMemoryStore, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving local mock KV data:', e);
  }
}

// Initial load
loadMockData();

const mockKv = {
  async get<T>(key: string): Promise<T | null> {
    if (isVercel) {
      throw new Error('Vercel KV is not configured. Please link a Vercel KV / Redis database in your project Storage tab or configure REDIS_URL.');
    }
    loadMockData();
    const val = inMemoryStore[key];
    if (val === undefined) return null;
    return val as T;
  },
  async set(key: string, value: any, options?: { ex?: number }): Promise<'OK'> {
    if (isVercel) {
      throw new Error('Vercel KV is not configured. Please link a Vercel KV / Redis database in your project Storage tab or configure REDIS_URL.');
    }
    inMemoryStore[key] = value;
    saveMockData();
    return 'OK';
  },
  async del(key: string): Promise<number> {
    if (isVercel) {
      throw new Error('Vercel KV is not configured. Please link a Vercel KV / Redis database in your project Storage tab or configure REDIS_URL.');
    }
    loadMockData();
    if (key in inMemoryStore) {
      delete inMemoryStore[key];
      saveMockData();
      return 1;
    }
    return 0;
  }
};

if (!isProdKV && !isVercel && !isTcpRedis) {
  console.log('Vercel KV credentials not found. Falling back to local filesystem mock KV storage.');
}

export const kv = isTcpRedis ? tcpKv : (isProdKV ? vercelKv : mockKv);
