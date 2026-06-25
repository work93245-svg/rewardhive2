import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Capsbit Postback Handler
 *
 * Receives conversion callbacks from Capsbit when users complete offers.
 * Validates signature, prevents duplicates, and credits user accounts.
 *
 * Expected Capsbit Postback Parameters:
 * - user_id: The user ID passed to the offer
 * - transId: Unique transaction identifier from Capsbit
 * - payout: Points earned
 * - status: "successful" or other status values
 * - userip: User's IP address
 * - country: User's country code
 * - offer_id: The offer/campaign ID
 * - offer_name: The offer name
 * - offer_type: The offer type/category
 * - signature: HMAC signature for verification
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Helper to get real IP from request
function getClientIP(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.headers.get("x-real-ip") || null;
}

// Validate UUID format
function isValidUUID(uuid: string): boolean {
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return regex.test(uuid);
}

// Get Supabase client (using service role for full access)
async function getSupabaseClient() {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase environment variables");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startTime = Date.now();
  const clientIP = getClientIP(req);

  console.log(`[Capsbit Postback] ${new Date().toISOString()} - IP: ${clientIP || 'unknown'}`);

  try {
    // Parse request - handle both GET and POST
    let params: Record<string, string> = {};

    if (req.method === "GET") {
      const url = new URL(req.url);
      params = Object.fromEntries(url.searchParams.entries());
    } else if (req.method === "POST") {
      const contentType = req.headers.get("content-type") || "";
      if (contentType.includes("application/x-www-form-urlencoded")) {
        const formData = await req.formData();
        params = Object.fromEntries(formData.entries() as Iterable<[string, string]>);
      } else if (contentType.includes("multipart/form-data")) {
        const formData = await req.formData();
        params = Object.fromEntries(formData.entries() as Iterable<[string, string]>);
      } else {
        const body = await req.text();
        try {
          const json = JSON.parse(body);
          params = typeof json === "object" ? json : {};
        } catch {
          const urlParams = new URLSearchParams(body);
          params = Object.fromEntries(urlParams.entries());
        }
      }
    } else {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const rawPayload = new URLSearchParams(params).toString();
    console.log(`[Capsbit Postback] Raw params:`, rawPayload);

    // Extract Capsbit parameters
    const userId = params.user_id;
    const transId = params.transId;
    const payoutStr = params.payout;
    const status = params.status;
    const userip = params.userip;
    const country = params.country;
    const offerId = params.offer_id;
    const offerName = params.offer_name;
    const offerType = params.offer_type;
    const signature = params.signature;

    // Validate required fields
    if (!userId) {
      console.error(`[Capsbit Postback] Missing user_id`);
      return new Response(JSON.stringify({
        success: false,
        error: "Missing user_id parameter"
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!transId) {
      console.error(`[Capsbit Postback] Missing transId`);
      return new Response(JSON.stringify({
        success: false,
        error: "Missing transId parameter"
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!isValidUUID(userId)) {
      console.error(`[Capsbit Postback] Invalid UUID: ${userId}`);
      return new Response(JSON.stringify({
        success: false,
        error: "Invalid user ID format"
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Parse payout
    let payout = parseFloat(payoutStr) || 0;
    if (payout <= 0) {
      console.error(`[Capsbit Postback] Invalid payout: ${payoutStr}`);
      return new Response(JSON.stringify({
        success: false,
        error: "Invalid payout amount"
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Only process successful conversions
    if (status !== "successful" && status !== "success" && status !== "1" && status !== "approved") {
      console.log(`[Capsbit Postback] Skipping non-successful status: ${status}`);
      return new Response(JSON.stringify({
        success: false,
        status: "skipped",
        message: `Status '${status}' not eligible for reward`
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    console.log(`[Capsbit Postback] Processing: user=${userId}, transId=${transId}, payout=${payout}`);

    const supabase = await getSupabaseClient();

    // Call the atomic postback processing function
    const { data, error } = await supabase.rpc("process_capsbit_postback", {
      p_transaction_id: transId,
      p_user_id: userId,
      p_amount: payout,
      p_ip_address: userip || clientIP,
      p_raw_payload: rawPayload,
      p_offer_id: offerId || null,
      p_offer_name: offerName || null,
      p_offer_type: offerType || null,
      p_country: country || null,
    });

    if (error) {
      console.error(`[Capsbit Postback] RPC error:`, error);
      return new Response(JSON.stringify({
        success: false,
        error: "Database error",
        details: error.message
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const result = data as Record<string, unknown>;
    const processingTime = Date.now() - startTime;

    if (result.success) {
      console.log(`[Capsbit Postback] SUCCESS: ${result.message || 'Processed'} - user=${userId}, points=+${result.points_earned}, time=${processingTime}ms`);
      return new Response(JSON.stringify({
        success: true,
        status: result.status,
        message: "Postback processed successfully",
        user_id: userId,
        points_earned: result.points_earned,
        new_balance: result.new_balance,
        processing_time_ms: processingTime
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } else {
      console.log(`[Capsbit Postback] DUPLICATE/INVALID: ${result.status} - user=${userId}, txid=${transId}`);
      return new Response(JSON.stringify({
        success: false,
        status: result.status,
        message: result.message || "Postback not processed",
        processing_time_ms: processingTime
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

  } catch (error) {
    console.error(`[Capsbit Postback] ERROR:`, error);
    return new Response(JSON.stringify({
      success: false,
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error"
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
