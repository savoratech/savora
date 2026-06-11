export async function onRequest(context) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };

  if (context.request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientId = context.env.FUEL_CLIENT_ID;
    const clientSecret = context.env.FUEL_CLIENT_SECRET;

    const tokenUrl =
      "https://www.fuel-finder.service.gov.uk/api/v1/oauth/generate_access_token";

    const pricesUrl =
      "https://www.fuel-finder.service.gov.uk/api/v1/pfs/fuel-prices?batch-number=1";

    const pfsUrl =
      "https://www.fuel-finder.service.gov.uk/api/v1/pfs?batch-number=1";

    if (!clientId || !clientSecret) {
      throw new Error("Missing Cloudflare environment variables.");
    }

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
      const errorText = await tokenResponse.text();
      throw new Error(`Token request failed: ${tokenResponse.status} ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    const pricesResponse = await fetch(pricesUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!pricesResponse.ok) {
      const errorText = await pricesResponse.text();
      throw new Error(`Prices request failed: ${pricesResponse.status} ${errorText}`);
    }

    const pricesData = await pricesResponse.json();

    const pfsResponse = await fetch(pfsUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!pfsResponse.ok) {
      const errorText = await pfsResponse.text();
      throw new Error(`PFS request failed: ${pfsResponse.status} ${errorText}`);
    }

    const pfsData = await pfsResponse.json();

    const combined = pfsData.map((station) => {
      const priceMatch = pricesData.find((p) => p.node_id === station.node_id);
      const fuelPrices = priceMatch?.fuel_prices || [];

      const e10 = fuelPrices.find((f) => f.fuel_type === "E10");
      const e5 = fuelPrices.find((f) => f.fuel_type === "E5");
      const diesel = fuelPrices.find((f) => f.fuel_type === "B7_STANDARD");

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

    const stations = combined
      .filter((station) => {
        return station.e10_price || station.e5_price || station.diesel_price;
      })
      .sort((a, b) => {
        if (a.e10_price === null) return 1;
        if (b.e10_price === null) return -1;
        return a.e10_price - b.e10_price;
      });

    return new Response(
      JSON.stringify({
        success: true,
        count: stations.length,
        stations,
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
        error: error.message,
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
}