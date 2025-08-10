import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    // First, verify the API key is available in the server environment.
    // This is a critical check for server-side security.
    if (!process.env.MISTRAL_API_KEY) {
        console.error('SERVER ERROR: MISTRAL_API_KEY is not set.');
        return NextResponse.json(
            { error: 'The server is missing the required API key configuration.' },
            { status: 500 }
        );
    }

    try {
        // Parse the incoming request body from the client.
        const { messages } = await request.json();

        // Ensure that messages are provided, as required by the Mistral API.
        if (!messages) {
            return NextResponse.json({ error: 'Messages are required in the request body.' }, { status: 400 });
        }
        
        // Call the official Mistral API endpoint.
        const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'mistral-large-latest', // Using the latest powerful model
                messages: messages,
                max_tokens: 100, // Kept concise for quick, actionable feedback
                temperature: 0.7, // A good balance between creativity and determinism
            }),
        });

        // If the response from Mistral itself is not successful, capture and forward the error.
        if (!response.ok) {
            const errorBody = await response.json();
            console.error('MISTRAL API ERROR:', errorBody);
            throw new Error(errorBody.message || `Mistral API responded with status ${response.status}`);
        }

        // Parse the successful JSON response from Mistral.
        const data = await response.json();
        
        // Send the successful response back to the client.
        return NextResponse.json(data);

    } catch (error: any) {
        // Catch any other errors during the process (e.g., network issues, JSON parsing failures).
        console.error('INTERNAL API ROUTE ERROR:', error.message);
        return NextResponse.json(
            { error: `Failed to get AI response: ${error.message}` },
            { status: 500 }
        );
    }
}