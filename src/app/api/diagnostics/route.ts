import { NextResponse } from 'next/server';

export async function GET() {
  // Returns only the NAMES of the keys for security, never the secrets
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
    hasKvUrl: !!process.env.KV_URL || !!process.env.UPSTASH_REDIS_URL,
    hasRestUrl: !!process.env.KV_REST_API_URL || !!process.env.UPSTASH_REDIS_REST_URL,
    hasRestToken: !!process.env.KV_REST_API_TOKEN || !!process.env.UPSTASH_REDIS_REST_TOKEN
  });
}
