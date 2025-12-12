export default {
    async fetch(request, env, ctx) {
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        };

        // Handle CORS preflight requests
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        const url = new URL(request.url);
        const query = url.searchParams.get('query');

        if (!env.GOOGLE_API_KEY) {
            return new Response(JSON.stringify({ error: 'Missing API Key configuration' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
            });
        }

        if (!query) {
            return new Response(JSON.stringify({ error: 'Missing query parameter' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
            });
        }

        try {
            // Step 1: Text Search to find the Place
            const searchUrl = 'https://places.googleapis.com/v1/places:searchText';
            const searchResponse = await fetch(searchUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': env.GOOGLE_API_KEY,
                    'X-Goog-FieldMask': 'places.name', // Requesting resource name (places/ID)
                },
                body: JSON.stringify({
                    textQuery: query,
                    maxResultCount: 1
                }),
            });

            const searchData = await searchResponse.json();

            if (!searchData.places || searchData.places.length === 0) {
                return new Response(JSON.stringify({ error: 'Hotel not found' }), {
                    status: 404,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders },
                });
            }

            const placeName = searchData.places[0].name; // Format: "places/ChIJ..."

            // Step 2: Get Place Details (Website & Phone)
            // placeName already includes "places/" prefix, so we append directly to base ID extraction or just use the resource URL
            // API endpoint: https://places.googleapis.com/v1/{name}
            const detailsUrl = `https://places.googleapis.com/v1/${placeName}`;

            const detailsResponse = await fetch(detailsUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': env.GOOGLE_API_KEY,
                    'X-Goog-FieldMask': 'websiteUri,internationalPhoneNumber',
                },
            });

            const detailsData = await detailsResponse.json();

            // Return the result
            const result = {
                website: detailsData.websiteUri || null,
                phone: detailsData.internationalPhoneNumber || null,
            };

            return new Response(JSON.stringify(result), {
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
            });

        } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
            });
        }
    },
};
