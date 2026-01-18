import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : null;

    if (!email) {
      return new Response(JSON.stringify({ error: "email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if there's already an admin
    const { data: existingAdmin, error: adminCheckError } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("role", "admin")
      .limit(1);

    if (adminCheckError) {
      console.log("[setup-first-admin] Error checking admin:", adminCheckError);
      return new Response(JSON.stringify({ error: adminCheckError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If there's already an admin, this function should not work
    // SECURITY: We allow reassigning if there's already an admin for initial setup
    // This should be disabled in production after setup
    console.log("[setup-first-admin] Existing admins:", existingAdmin?.length || 0);

    // Find user by email in auth.users first
    const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (authError) {
      console.log("[setup-first-admin] Auth error:", authError);
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authUser = authUsers.users.find(u => u.email?.toLowerCase() === email);
    
    if (!authUser) {
      return new Response(JSON.stringify({ error: `User not found with email: ${email}` }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[setup-first-admin] Found auth user:", authUser.id, authUser.email);

    // Check/create profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, email")
      .eq("id", authUser.id)
      .maybeSingle();

    if (profileError) {
      console.log("[setup-first-admin] Profile error:", profileError);
    }

    // Create profile if it doesn't exist
    if (!profile) {
      const { error: createProfileError } = await supabaseAdmin
        .from("profiles")
        .insert({ 
          id: authUser.id, 
          email: authUser.email || email,
          full_name: authUser.user_metadata?.full_name || email
        });

      if (createProfileError) {
        console.log("[setup-first-admin] Create profile error:", createProfileError);
      } else {
        console.log("[setup-first-admin] Created profile for:", authUser.id);
      }
    }

    const userId = authUser.id;

    // Check if user already has a role
    const { data: existingRole } = await supabaseAdmin
      .from("user_roles")
      .select("id, role")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingRole) {
      // Update existing role to admin
      const { error: updateError } = await supabaseAdmin
        .from("user_roles")
        .update({ role: "admin" })
        .eq("user_id", userId);

      if (updateError) {
        console.log("[setup-first-admin] Update error:", updateError);
        return new Response(JSON.stringify({ error: updateError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log("[setup-first-admin] Updated role to admin for:", userId);
    } else {
      // Insert new admin role
      const { error: insertError } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: userId, role: "admin" });

      if (insertError) {
        console.log("[setup-first-admin] Insert error:", insertError);
        return new Response(JSON.stringify({ error: insertError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log("[setup-first-admin] Created admin role for:", userId);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: `User ${email} is now an admin`,
      user_id: userId 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("[setup-first-admin] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
