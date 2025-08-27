import { Handler } from '@netlify/functions';
import { makeBQ } from "../../src/lib/bq.js";

export const handler: Handler = async () => {
  try {
    const bq = makeBQ();
    const r = await bq.ready();
    return { 
      statusCode: 200, 
      body: JSON.stringify({ 
        ok: r.ok, 
        cred_mode: bq.cred_mode,
        build: bq.build
      })
    };
  } catch (e: any) {
    return { 
      statusCode: 200, 
      body: JSON.stringify({ 
        ok: false, 
        err: String(e?.message || e),
        timestamp: new Date().toISOString()
      })
    };
  }
};
