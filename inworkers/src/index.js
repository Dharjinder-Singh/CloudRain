export default {
    async fetch(request, env) {
      try {
        if (request.method !== "POST") {
          return new Response(JSON.stringify({ error: "Send an audio file via POST" }), {
            status: 405,
            headers: { "Content-Type": "application/json" }
          });
        }
  
        // Read incoming audio data
        const blob = await request.arrayBuffer();
        console.log("Audio data received:", blob.byteLength, "bytes");
  
        if (!blob || blob.byteLength === 0) {
          return new Response(JSON.stringify({ error: "No audio data received" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }
  
        // Send audio to Cloudflare AI for transcription
        const inputs = { audio: [...new Uint8Array(blob)] };
        const response = await env.AI.run("@cf/openai/whisper", inputs);
  
        // Log the raw response from Whisper to debug
        console.log("Whisper response:", response);
  
        // Ensure transcription has the 'text' field
        if (response && response.text) {
          // Proceed with the transcription and summarization
          const summaryResponse = await processTranscriptionAndSummarize(response, env);
          return summaryResponse;  // Return the processed summary response
        } else {
          throw new Error("Transcription failed or missing 'text' field in response.");
        }
  
      } catch (error) {
        console.error("Worker error:", error);
  
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
  };
  
  async function processTranscriptionAndSummarize(transcription, env) {
    // 1. Extract Transcribed Text
    const transcriptText = transcription.text; // Directly use 'text' as it's available now
    console.log("Transcribed Text:", transcriptText);  // Log the transcribed text
  
    // 2. Construct the prompt for LLaMA-2 summarization model
    const prompt = `
      Summarize this meeting transcript and extract:
      - Key points discussed
      - Deadlines mentioned
      - Tasks assigned and to whom
  
      Transcript: "${transcriptText}". If there's nothing important, just say 'No key points found. Don't say anything in long form
      just say NIL if no data. No need to write a sentence if no data is extracted. only say NIL.'
    `;
  
    console.log("Prompt being sent to LLaMA-2:", prompt);
  
    // 3. Send the prompt to the AI model for summarization (LLaMA-2 or any other model)
    const summaryResponse = await env.AI.run("@cf/meta/llama-2-7b-chat-int8", { prompt });
  
    // 4. Process the result and send it back as the response
    const summary = summaryResponse.response || 'No key points found.';
    return new Response(JSON.stringify({ summary }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  