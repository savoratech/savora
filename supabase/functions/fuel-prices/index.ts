const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const clientId = Deno.env.get("FUEL_CLIENT_ID");
    const clientSecret = Deno.env.get("FUEL_CLIENT_SECRET");
    const tokenUrl = Deno.env.get("FUEL_TOKEN_URL");
    const pricesUrl = Deno.env.get("FUEL_PRICES_URL");
    const pfsUrl = Deno.env.get("FUEL_PFS_URL");

    if (!clientId || !clientSecret || !tokenUrl || !pricesUrl || !pfsUrl) {
      throw new Error("Missing Fuel Finder environment secrets.");
    }

    // Get Fuel Finder access token
    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenResponse.ok) {
      const tokenError = await tokenResponse.text();
      throw new Error(`Token request failed: ${tokenResponse.status} ${tokenError}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      throw new Error("No access token returned from Fuel Finder.");
    }

    // Fetch fuel prices - batch 1
    const pricesResponse = await fetch(`${pricesUrl}?batch-number=1`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!pricesResponse.ok) {
      const priceError = await pricesResponse.text();
      throw new Error(`Prices request failed: ${pricesResponse.status} ${priceError}`);
    }

    const pricesData = await pricesResponse.json();

    // Fetch petrol station info - batch 1
    const pfsResponse = await fetch(`${pfsUrl}?batch-number=1`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!pfsResponse.ok) {
      const pfsError = await pfsResponse.text();
      throw new Error(`PFS request failed: ${pfsResponse.status} ${pfsError}`);
    }

    const pfsData = await pfsResponse.json();

    // Match prices to petrol station info using node_id
    const combined = pfsData.map((station: any) => {
      const priceMatch = pricesData.find((priceStation: any) => {
        return priceStation.node_id === station.node_id;
      });

      const fuelPrices = priceMatch?.fuel_prices || [];

      const e10 = fuelPrices.find((fuel: any) => fuel.fuel_type === "E10");
      const e5 = fuelPrices.find((fuel: any) => fuel.fuel_type === "E5");
      const diesel = fuelPrices.find((fuel: any) => fuel.fuel_type === "B7_STANDARD");

      return {
        node_id: station.node_id,
        trading_name: station.trading_name,
        brand_name: station.brand_name,
        postcode: station.location?.postcode || null,
        city: station.location?.city || null,
        address: station.location?.address_line_1 || null,
        latitude: station.location?.latitude || null,
        longitude: station.location?.longitude || null,
        e10_price: e10?.price || null,
        e5_price: e5?.price || null,
        diesel_price: diesel?.price || null,
        last_updated:
          e10?.price_last_updated ||
          diesel?.price_last_updated ||
          e5?.price_last_updated ||
          null,
      };
    });

    // Only keep stations with at least one price
    const stationsWithPrices = combined.filter((station: any) => {
      return station.e10_price || station.e5_price || station.diesel_price;
    });

    // Sort cheapest E10 first
    stationsWithPrices.sort((a: any, b: any) => {
      if (a.e10_price === null) return 1;
      if (b.e10_price === null) return -1;
      return a.e10_price - b.e10_price;
    });

    return new Response(
      JSON.stringify({
        success: true,
        count: stationsWithPrices.length,
        stations: stationsWithPrices,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});