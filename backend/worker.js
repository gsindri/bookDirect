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

            // Step 3: SNIPER SCRAPE - Extract email from hotel website
            let foundEmail = null;

            if (detailsData.websiteUri) {
                try {
                    // Fetch the hotel's homepage
                    const websiteResponse = await fetch(detailsData.websiteUri, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (compatible; HotelFinder/1.0)',
                        },
                        // Don't follow too many redirects, timeout after 5s
                        redirect: 'follow',
                    });

                    if (websiteResponse.ok) {
                        const html = await websiteResponse.text();

                        // Priority 1: Look for mailto: links
                        const mailtoMatch = html.match(/mailto:([a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6})/i);

                        // Priority 2: Look for email patterns in text
                        const emailPattern = /[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}/gi;
                        const allEmails = html.match(emailPattern) || [];

                        // Junk email filter - ignore these patterns
                        const junkPatterns = [
                            /^sentry@/i,
                            /^noreply@/i,
                            /^no-reply@/i,
                            /^wix@/i,
                            /^support@wix/i,
                            /^admin@/i,
                            /^webmaster@/i,
                            /example\.com$/i,
                            /sentry\.io$/i,
                            /wix\.com$/i,
                            /schema\.org$/i,
                        ];

                        const isJunk = (email) => junkPatterns.some(pattern => pattern.test(email));

                        // Priority 1: Use mailto if valid
                        if (mailtoMatch && mailtoMatch[1] && !isJunk(mailtoMatch[1])) {
                            foundEmail = mailtoMatch[1].toLowerCase();
                        } else {
                            // Priority 2: Find first valid email from all matches
                            // Prefer emails with "reserv", "book", "info", "contact" in them
                            const priorityKeywords = ['reserv', 'book', 'info', 'contact', 'front', 'recep'];
                            const validEmails = allEmails.filter(e => !isJunk(e));

                            // Sort by priority keywords
                            const prioritized = validEmails.sort((a, b) => {
                                const aHasPriority = priorityKeywords.some(k => a.toLowerCase().includes(k));
                                const bHasPriority = priorityKeywords.some(k => b.toLowerCase().includes(k));
                                if (aHasPriority && !bHasPriority) return -1;
                                if (!aHasPriority && bHasPriority) return 1;
                                return 0;
                            });

                            if (prioritized.length > 0) {
                                foundEmail = prioritized[0].toLowerCase();
                            }
                        }
                    }
                } catch (scrapeError) {
                    // Silently ignore scrape failures - website might be down or blocking
                    console.log('Email scrape failed:', scrapeError.message);
                }
            }

            // Return the result
            const result = {
                website: detailsData.websiteUri || null,
                phone: detailsData.internationalPhoneNumber || null,
                found_email: foundEmail,
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
