export async function handler(event: any, context: any) {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ ok: true, env: "netlify" })
  };
}
