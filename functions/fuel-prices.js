let cachedAccessToken = null;
let cachedTokenExpiresAt = 0;
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
    const url = new URL(context.request.url);
    const postcode = url.searchParams.get("postcode");
    const selectedFuelType = url.searchParams.get("fuelType") || "E10";

    if (!postcode) {
      throw new Error("Postcode is required.");
    }

    const clientId = context.env.FUEL_CLIENT_ID;
    const clientSecret = context.env.FUEL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("Missing Cloudflare environment variables.");
    }

    const tokenUrl =
      "https://www.fuel-finder.service.gov.uk/api/v1/oauth/generate_access_token";

    const pricesBaseUrl =
      "https://www.fuel-finder.service.gov.uk/api/v1/pfs/fuel-prices";

    const pfsBaseUrl =
      "https://www.fuel-finder.service.gov.uk/api/v1/pfs";

    const apiHeaders = {
      "User-Agent": "Mozilla/5.0 Savora/1.0",
      Accept: "application/json",
    };

    // 1. Convert postcode to latitude/longitude
    const cleanPostcode = postcode.replace(/\s+/g, "");
    const postcodeResponse = await fetch(
      `https://api.postcodes.io/postcodes/${encodeURIComponent(cleanPostcode)}`,
      {
        headers: apiHeaders,
      }
    );

    if (!postcodeResponse.ok) {
      throw new Error("Could not find that postcode.");
    }

    const postcodeData = await postcodeResponse.json();

    if (!postcodeData.result) {
      throw new Error("Postcode not found.");
    }

    const userLat = postcodeData.result.latitude;
    const userLon = postcodeData.result.longitude;

    // 2. Generate or reuse Fuel Finder access token
let accessToken = cachedAccessToken;

if (!accessToken || Date.now() >= cachedTokenExpiresAt) {
  const tokenResponse = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...apiHeaders,
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

  accessToken =
    tokenData.access_token ||
    tokenData.data?.access_token ||
    tokenData.data?.token ||
    tokenData.token;

  if (!accessToken) {
    throw new Error(
      `No access token found. Token response shape: ${JSON.stringify({
        keys: Object.keys(tokenData),
        dataKeys: tokenData.data ? Object.keys(tokenData.data) : null,
        success: tokenData.success,
        message: tokenData.message,
      })}`
    );
  }

  const expiresInSeconds =
    tokenData.expires_in ||
    tokenData.data?.expires_in ||
    3600;

  cachedAccessToken = accessToken;
  cachedTokenExpiresAt = Date.now() + (expiresInSeconds - 300) * 1000;
}

    // 3. Fetch multiple Fuel Finder batches
    // Start with 10 batches. Each batch can contain up to 500 forecourts.
    // We can increase this later if needed.
    const maxBatches = 10;

    const allPrices = [];
    const allStations = [];

    for (let batch = 1; batch <= maxBatches; batch++) {
      const [pricesResponse, pfsResponse] = await Promise.all([
        fetch(`${pricesBaseUrl}?batch-number=${batch}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            ...apiHeaders,
          },
        }),
        fetch(`${pfsBaseUrl}?batch-number=${batch}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            ...apiHeaders,
          },
        }),
      ]);

      if (!pricesResponse.ok || !pfsResponse.ok) {
        // Stop if the API has no more batches or blocks a later batch.
        break;
      }

      const pricesData = await pricesResponse.json();
      const pfsData = await pfsResponse.json();

      if (!Array.isArray(pricesData) || !Array.isArray(pfsData)) {
        break;
      }

      if (pricesData.length === 0 && pfsData.length === 0) {
        break;
      }

      allPrices.push(...pricesData);
      allStations.push(...pfsData);

      if (pfsData.length < 500) {
        break;
      }
    }

    // 4. Combine station info with price info
    const combined = allStations.map((station) => {
      const priceMatch = allPrices.find((p) => p.node_id === station.node_id);
      const fuelPrices = priceMatch?.fuel_prices || [];

      const e10 = fuelPrices.find((f) => f.fuel_type === "E10");
      const e5 = fuelPrices.find((f) => f.fuel_type === "E5");
      const diesel = fuelPrices.find((f) => f.fuel_type === "B7_STANDARD");

      const stationLat = station.location?.latitude;
      const stationLon = station.location?.longitude;

      const distanceMiles =
        stationLat && stationLon
          ? calculateDistanceMiles(userLat, userLon, stationLat, stationLon)
          : null;

      return {
        node_id: station.node_id,
        trading_name: station.trading_name,
        brand_name: station.brand_name,
        postcode: station.location?.postcode || null,
        city: station.location?.city || null,
        address: station.location?.address_line_1 || null,
        latitude: stationLat || null,
        longitude: stationLon || null,
        distance_miles: distanceMiles,
        e10_price: e10?.price || null,
        e5_price: e5?.price || null,
        diesel_price: diesel?.price || null,
        selected_price:
          selectedFuelType === "E5"
            ? e5?.price || null
            : selectedFuelType === "B7"
            ? diesel?.price || null
            : e10?.price || null,
        last_updated:
          e10?.price_last_updated ||
          diesel?.price_last_updated ||
          e5?.price_last_updated ||
          null,
      };
    });

    // 5. Keep stations within 20 miles that have the selected fuel price
    const nearbyStations = combined
      .filter((station) => {
        return (
          station.distance_miles !== null &&
          station.distance_miles <= 20 &&
          station.selected_price !== null
        );
      })
      .sort((a, b) => {
        // Sort by cheapest selected fuel first, then nearest
        if (a.selected_price !== b.selected_price) {
          return a.selected_price - b.selected_price;
        }

        return a.distance_miles - b.distance_miles;
      })
      .slice(0, 20);

    return new Response(
      JSON.stringify({
        success: true,
        postcode: postcodeData.result.postcode,
        fuelType: selectedFuelType,
        count: nearbyStations.length,
        stations: nearbyStations,
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

function calculateDistanceMiles(lat1, lon1, lat2, lon2) {
  const earthRadiusMiles = 3958.8;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(earthRadiusMiles * c * 10) / 10;
}

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}