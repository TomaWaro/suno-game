import { NextResponse } from 'next/server';
import { isTcpRedis } from '@/lib/kv';

export async function GET() {
  const keys = Object.keys(process.env).filter(key => 
    key.includes('KV') || 
    key.includes('REDIS') || 
    key.includes('UPSTASH') || 
    key === 'VERCEL' ||
    key === 'NODE_ENV'
  );
  
  return NextResponse.json({ 
    envKeys: keys,
    vercelDetected: process.env.VERCEL === '1',
    hasKvUrl: !!process.env.KV_URL || !!process.env.UPSTASH_REDIS_URL || !!process.env.REDIS_URL,
    hasRestUrl: !!process.env.KV_REST_API_URL || !!process.env.UPSTASH_REDIS_REST_URL,
    hasRestToken: !!process.env.KV_REST_API_TOKEN || !!process.env.UPSTASH_REDIS_REST_TOKEN,
    hasTcpRedis: isTcpRedis
  });
}
