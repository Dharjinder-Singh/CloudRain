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

        // Process transcript and get summary + tasks
        const summaryResponse = await processTranscriptionAndSummarize(completeTranscript, env);
        console.log("Generated Summary:", summaryResponse);

        // Store meeting details in D1 database
        await env.DB.prepare(
          "INSERT INTO meetings (name, date, summary) VALUES (?, ?, ?)"
        )
          .bind(meetingName, meetingDate, JSON.stringify(summaryResponse))
          .run();

        console.log(`Stored meeting '${meetingName}' on ${meetingDate} in database.`);

        // Send summary to Slack
        const slackResponse = await sendSlackMessage(env, summaryResponse);
        console.log("Slack response:", slackResponse);

        // Add tasks with deadlines to Todoist
        if (summaryResponse.deadlines.length > 0) {
          await addTasksToTodoist(summaryResponse.deadlines, env);
        }

        // Clean up KV Storage
        for (let i = 1; i <= totalChunks; i++) {
          await env.TRANSCRIPT_KV.delete(`chunk-${i}`);
        }
        await env.TRANSCRIPT_KV.delete("totalChunks");
        await env.TRANSCRIPT_KV.delete("receivedChunks");
        await env.TRANSCRIPT_KV.delete("meetingName");
        await env.TRANSCRIPT_KV.delete("meetingDate");

        return new Response(JSON.stringify({ message: "Meeting summary stored, sent to Slack, and tasks added to Todoist.", summary: summaryResponse.summary }), {
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
   const prompt = `Summarize this meeting transcript and extract details in the following JSON format:

  {
    "summary": "A concise yet detailed summary of the meeting discussions, covering key points and conclusions.",
    "tasks": [
      {
        "task": "Description of the assigned task",
        "assigned_to": "Person responsible",
        "deadline": "YYYY-MM-DD or 'None' if no deadline"
      }
    ],
    "deadlines": [
      {
        "task": "Task related to this deadline",
        "date": "YYYY-MM-DD"
      }
    ]
  }

  Transcript: "${transcription}"

  - Provide a structured summary capturing all main points.
  - If there are no tasks or deadlines, return an empty list (\`[]\`).
  - Ensure the summary is comprehensive while still being concise
  - try to detect soft deadlines too like if the transcript says complete by xyz time then the particular task should be added
  to the deadline array. I need to add stuff to my todoist. so add the tasks in the deadline array too(Please man). The date we are sending
  this prompt to you is 08-02-2026. Take care of the dates accordingly.
  -VERY IMPORTANT=> DONT GIVE ANYTHING OUTSIDE THE JSON FORMAT. NOTHING SHOULD BE THERE EXCEPT THE JSON.
  DONT EVEN INTRODUCE YOUR ANSWER. JUST START WITH THE JSON OR I WILL GET AN ERROR. PLEASE!!!!
  `;

  console.log("Prompt being sent to LLaMA-2:", prompt);
  const summaryResponse = await env.AI.run("@cf/meta/llama-2-7b-chat-int8", { prompt });

  try {
    return JSON.parse(summaryResponse.response || "{}");
  } catch (error) {
    console.error("Error parsing AI response:", error);
    return { summary: "No key points found.", tasks: [], deadlines: [] };
  }
}

// Function to send message to Slack
async function sendSlackMessage(env, summaryResponse) {
  const SLACK_WEBHOOK_URL = env.SLACK_WEBHOOK_URL;

  console.log("SLACK_WEBHOOK_URL:", SLACK_WEBHOOK_URL); // Debugging Webhook URL

  if (!SLACK_WEBHOOK_URL) {
    console.error("Error: Slack Webhook URL is missing.");
    return { error: "Slack Webhook URL is not set." };
  }

  const message = `*Meeting Summary*\n${summaryResponse.summary}`;

  try {
    console.log("Sending Slack Message:", message);

    const slackResponse = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });

    const rawResponse = await slackResponse.text();
    console.log("Raw Slack Response:", rawResponse);

    return slackResponse.ok ? { success: true, response: rawResponse } : { error: rawResponse };
  } catch (error) {
    console.error("Failed to send Slack message:", error);
    return { error: error.message };
  }
}

// Function to add tasks with deadlines to Todoist
async function addTasksToTodoist(deadlines, env) {
  const TODOIST_API_TOKEN = env.TODOIST_API_KEY;

  for (const deadline of deadlines) {
    const taskBody = {
      content: deadline.task,
      due_string: deadline.date, // Todoist understands natural dates
    };

    try {
      const response = await fetch("https://api.todoist.com/rest/v2/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${TODOIST_API_TOKEN}`
        },
        body: JSON.stringify(taskBody),
      });

      const data = await response.json();
      console.log(`Todoist Task Created: ${data.id} - ${data.content}`);
    } catch (error) {
      console.error("Failed to add task to Todoist:", error);
    }
  }
}
