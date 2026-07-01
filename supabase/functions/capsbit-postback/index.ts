import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import md5 from "https://esm.sh/md5@2.3.0";

/**
 * Capsbit Postback Handler
 *
 * Receives conversion callbacks from Capsbit when users complete offers.
 * Validates signature, prevents duplicates, and credits user accounts.
 *
 * Signature Verification:
 * Expected signature = MD5(user_id + payout + offer_id + transId + SECRET_KEY)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const CAPSBIT_SECRET_KEY = "469c8d5b186be1bc3fcf177ccc4c5c39";

function getClientIP(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || null;
}

function isValidUUID(uuid: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
}

async function getSupabaseClient() {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase env vars");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const startTime = Date.now();
  const clientIP = getClientIP(req);
  console.log(`[Capsbit Postback] ${new Date().toISOString()} - IP: ${clientIP || 'unknown'}`);

  try {
    let params: Record<string, string> = {};

    if (req.method === "GET") {
      params = Object.fromEntries(new URL(req.url).searchParams.entries());
    } else if (req.method === "POST") {
      const contentType = req.headers.get("content-type") || "";
      if (contentType.includes("form")) {
        const formData = await req.formData();
        params = Object.fromEntries(formData.entries() as Iterable<[string, string]>);
      } else {
        const body = await req.text();
        try { params = JSON.parse(body); } catch {
          params = Object.fromEntries(new URLSearchParams(body).entries());
        }
      }
    } else {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const rawPayload = new URLSearchParams(params).toString();
    console.log(`[Capsbit Postback] Raw params:`, rawPayload);

    const transId = params.transId;
    const userId = params.user_id;
    const payoutStr = params.payout;
    const rewardValueStr = params.reward_value;
    const status = params.status;
    const userip = params.userip;
    const country = params.country;
    const offerId = params.offer_id;
    const offerName = params.offer_name;
    const offerType = params.offer_type;
    const signature = params.signature;

    const missingParams: string[] = [];
    if (!transId) missingParams.push("transId");
    if (!userId) missingParams.push("user_id");
    if (!payoutStr) missingParams.push("payout");
    if (!offerId) missingParams.push("offer_id");
    if (!signature) missingParams.push("signature");

    if (missingParams.length > 0) {
      return new Response(JSON.stringify({ success: false, error: "Missing required parameters", missing: missingParams }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!isValidUUID(userId)) {
      return new Response(JSON.stringify({ success: false, error: "Invalid user ID format" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const expectedSig = md5(userId + payoutStr + offerId + transId + CAPSBIT_SECRET_KEY);
    console.log(`[Capsbit Postback] Expected: ${expectedSig}, Got: ${signature}`);

    if (signature.toLowerCase() !== expectedSig.toLowerCase()) {
      return new Response(JSON.stringify({ success: false, error: "Invalid signature" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const payout = parseFloat(payoutStr) || 0;
    const rewardValue = rewardValueStr ? parseFloat(rewardValueStr) : null;
    const pointsToCredit = (rewardValue !== null && rewardValue > 0) ? Math.round(rewardValue) : Math.round(payout);

    if (pointsToCredit <= 0) {
      return new Response(JSON.stringify({ success: false, error: "Invalid amount" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const statusLower = status?.toLowerCase();
    const isApproved = statusLower === "approved" || status === "1";

    if (!isApproved) {
      return new Response(JSON.stringify({ success: false, status: "skipped", message: `Status '${status}' not eligible` }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[Capsbit Postback] Processing: user=${userId}, transId=${transId}, points=${pointsToCredit}`);

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.rpc("process_capsbit_postback", {
      p_transaction_id: transId,
      p_user_id: userId,
      p_amount: pointsToCredit,
      p_ip_address: userip || clientIP,
      p_raw_payload: rawPayload,
      p_offer_id: offerId,
      p_offer_name: offerName || null,
      p_offer_type: offerType || null,
      p_country: country || null
    });

    if (error) {
      console.error(`[Capsbit Postback] RPC error:`, error);
      return new Response(JSON.stringify({ success: false, error: "Database error", details: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const result = data as Record<string, unknown>;
    const processingTime = Date.now() - startTime;

    if (result.success) {
      console.log(`[Capsbit Postback] SUCCESS: user=${userId}, points=+${result.points_earned}`);
      return new Response(JSON.stringify({ success: true, status: result.status, message: "Processed", user_id: userId, points_earned: result.points_earned, new_balance: result.new_balance, processing_time_ms: processingTime }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } else {
      return new Response(JSON.stringify({ success: false, status: result.status, message: result.message || "Not processed" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

  } catch (error) {
    console.error(`[Capsbit Postback] ERROR:`, error);
    return new Response(JSON.stringify({ success: false, error: "Internal server error", details: error instanceof Error ? error.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
