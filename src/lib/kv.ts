import fs from 'fs';
import path from 'path';
import { kv as vercelKv } from '@vercel/kv';

const MOCK_FILE_PATH = path.join(process.cwd(), '.next', 'mock-kv.json');

let inMemoryStore: Record<string, any> = {};

function loadMockData() {
  try {
    if (fs.existsSync(MOCK_FILE_PATH)) {
      const data = fs.readFileSync(MOCK_FILE_PATH, 'utf8');
      inMemoryStore = JSON.parse(data);
    }
  } catch (e) {
    // Fallback if file doesn't exist yet
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
    loadMockData();
    const val = inMemoryStore[key];
    if (val === undefined) return null;
    return val as T;
  },
  async set(key: string, value: any, options?: { ex?: number }): Promise<'OK'> {
    inMemoryStore[key] = value;
    saveMockData();
    return 'OK';
  },
  async del(key: string): Promise<number> {
    loadMockData();
    if (key in inMemoryStore) {
      delete inMemoryStore[key];
      saveMockData();
      return 1;
    }
    return 0;
  }
};

const isProdKV = !!process.env.KV_REST_API_URL;

if (!isProdKV) {
  console.log('Vercel KV credentials not found. Falling back to local filesystem mock KV storage.');
}

export const kv = isProdKV ? vercelKv : mockKv;
