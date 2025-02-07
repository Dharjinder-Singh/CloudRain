export default {
  async fetch(request, env) {
    try {
      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Send an audio file via POST" }), {
          status: 405,
          headers: { "Content-Type": "application/json" }
        });
      }

      // Extract meeting metadata from headers
      const meetingName = request.headers.get("X-Meeting-Name") || "Unnamed Meeting";
      const meetingDate = request.headers.get("X-Meeting-Date") || new Date().toISOString();

      // Read audio data
      const blob = await request.arrayBuffer();
      console.log("Audio data received:", blob.byteLength, "bytes");

      if (!blob || blob.byteLength === 0) {
        return new Response(JSON.stringify({ error: "No audio data received" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      // Transcribe using Cloudflare AI
      const inputs = { audio: [...new Uint8Array(blob)] };
      const response = await env.AI.run("@cf/openai/whisper", inputs);
      const transcribedText = response.text || "";

      // Extract chunk info from headers
      const totalChunks = parseInt(request.headers.get("X-Total-Chunks") || "1");
      const currentChunk = parseInt(request.headers.get("X-Current-Chunk") || "1");

      console.log(`Received chunk ${currentChunk} of ${totalChunks}`);

      // Store chunk in KV Storage
      await env.TRANSCRIPT_KV.put(`chunk-${currentChunk}`, transcribedText);
      await env.TRANSCRIPT_KV.put("totalChunks", totalChunks.toString());
      await env.TRANSCRIPT_KV.put("receivedChunks", currentChunk.toString());
      await env.TRANSCRIPT_KV.put("meetingName", meetingName);
      await env.TRANSCRIPT_KV.put("meetingDate", meetingDate);

      // Check if all chunks are received
      if (currentChunk === totalChunks) {
        console.log("All chunks received. Processing full transcript...");

        // Retrieve all chunks and assemble transcript
        let completeTranscript = "";
        for (let i = 1; i <= totalChunks; i++) {
          const chunkText = await env.TRANSCRIPT_KV.get(`chunk-${i}`) || "";
          completeTranscript += chunkText + " ";
        }

        // Process transcript and get summary
        const summaryResponse = await processTranscriptionAndSummarize(completeTranscript, env);
        const summaryText = summaryResponse.summary || "No key points found.";
        console.log(summaryResponse);
        console.log(summaryText);
        // Store meeting details in D1 database
        await env.DB.prepare(
          "INSERT INTO meetings(name, date, summary) VALUES (?, ?, ?)"
        )
          .bind(meetingName, meetingDate, summaryText)
          .run();

        console.log(`Stored meeting '${meetingName}' on ${meetingDate} in database.`);

        // Clean up KV Storage
        for (let i = 1; i <= totalChunks; i++) {
          await env.TRANSCRIPT_KV.delete(`chunk-${i}`);
        }
        await env.TRANSCRIPT_KV.delete("totalChunks");
        await env.TRANSCRIPT_KV.delete("receivedChunks");
        await env.TRANSCRIPT_KV.delete("meetingName");
        await env.TRANSCRIPT_KV.delete("meetingDate");

        return new Response(JSON.stringify({ message: "Meeting summary stored", summary: summaryText}), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({ message: `Chunk ${currentChunk}/${totalChunks} stored.` }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });

    } catch (error) {
      console.error("Worker error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
};

// Function to summarize transcription using LLaMA-2
async function processTranscriptionAndSummarize(transcription, env) {
  const prompt = `
    Summarize this meeting transcript and extract:
    - Key points discussed
    - Deadlines mentioned
    - Tasks assigned and to whom

    Transcript: "${transcription}". If nothing important, just say 'NIL'. If you think some text doesn't add anything and contains no information
    then ignore that text and don't mention it.
  `;

  console.log("Prompt being sent to LLaMA-2:", prompt);
  const summaryResponse = await env.AI.run("@cf/meta/llama-2-7b-chat-int8", { prompt });

  return { summary: summaryResponse.response || "No key points found." };
}
