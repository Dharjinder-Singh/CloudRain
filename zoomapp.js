const puppeteer = require('puppeteer')
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const AUDIO_FILE="F:\\CloudRain\\audio_file\\bca.mp3";
const CLOUDFLARE_WORKER_URL = "https://inworkers.dharjindersingh4.workers.dev";

const joinZoomMeeting = async (meetingId, passcode, displayName) => {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', // Adjust path for your OS
    args: ['--start-maximized',
      '--use-fake-ui-for-media-stream',  // ✅ Auto-allow camera & microphone
      '--use-fake-device-for-media-stream', // ✅ Use a fake media device for testing
      '--allow-file-access-from-files',
      '--enable-usermedia-screen-capturing',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
  });


  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  // Navigate to Zoom's join meeting page
  await page.goto('https://app.zoom.us/wc/', { waitUntil: 'networkidle2' });
  console.log('opend the zoom page')


  // Click "Join Meeting" button if required
  await page.waitForSelector('.btn-index-join', { visible: true, timeout: 60000 });
  await page.click('.btn-index-join');
  console.log('clicked the join meeting')

  // Handle any alert popups
  page.on('dialog', async (dialog) => {
    console.log(`Dialog detected: ${dialog.message()}`);
    await dialog.accept(); // Automatically accept popups
  });
  console.log('cleared')
  const context = browser.defaultBrowserContext();
  await context.overridePermissions("https://app.zoom.us", [
    "clipboard-read",
    "clipboard-write",
    "geolocation",
    "camera",   // ✅ Allow camera
    "microphone",  // ✅ Allow microphone
  ]);

  // Enter the Meeting ID
  await page.waitForSelector('.join-meetingId', { visible: true });
  await page.type('.join-meetingId', meetingId);
  await page.click('.btn-join');

  // Handle "Continue without Audio and Video" dialog


  // Notice "camera" and "microphone" are not included
  await context.overridePermissions("https://app.zoom.us", [
    "clipboard-read",
    "clipboard-write",
    "geolocation",
  ]);

  console.log("✅ Permissions overridden to block camera & microphone.");

  /*await page.waitForSelector('.continue', { visible: true });
  await page.click('.continue');
  console.log('clicked the continue');*/
  page.on('dialog', async (dialog) => {
    console.log(`Dialog detected: ${dialog.message()}`);
    await dialog.accept();  // Clicks "Continue"
  });


  try {
    console.log('⏳ Waiting for the "Continue without Audio and Video" prompt...');
    await page.waitForSelector('button[aria-label="Continue without audio and video"]', { visible: true, timeout: 10000 });

    console.log('✅ Clicking "Continue without Audio and Video"...');
    await page.click('button[aria-label="Continue without audio and video"]');

    console.log('🎉 Successfully bypassed audio/video prompt.');
  } catch (error) {
    console.log('⚠️ No "Continue without Audio and Video" prompt appeared.');
  }


  // Handle passcode input
  // Debugging: Print the page content to check structure
  const pageContent = await page.content();
  console.log("Page content:", pageContent); // This will show the HTML content of the page

  // Check if the passcode input is inside an iframe
  const iframe = await page.$('iframe');
  if (iframe) {
    console.log('Passcode input field is inside an iframe. Switching context...');
    const iframeContent = await iframe.contentFrame();
    // Now interact with elements inside the iframe
    await iframeContent.waitForSelector('input[type="password"]', { visible: true, timeout: 15000 });
    console.log('Passcode input field found inside iframe. Entering passcode...');
    await iframeContent.type('input[type="password"]', passcode);
    console.log('Passcode entered successfully.');
  } else {
    // If the passcode input field is not in an iframe, proceed as normal
    console.log('No iframe detected, continuing normal flow...');
    try {
      // Ensure that the passcode input field is available
      await page.waitForSelector('input[type="password"]', { visible: true, timeout: 15000 });
      console.log('Passcode input field found. Entering passcode...');
      await page.type('input[type="password"]', passcode);
      console.log('Passcode entered successfully.');
    } catch (error) {
      console.log('Passcode input field not found within the given time.');
    }
  }

  // Enter Display Name if required
  console.log('Waiting for the display name input field...');
  try {
    // Check if display name input is inside an iframe
    const iframeForName = await page.$('iframe');
    if (iframeForName) {
      console.log('Display name input field is inside an iframe. Switching context...');
      const iframeContent = await iframeForName.contentFrame();
      // Now interact with elements inside the iframe
      await iframeContent.waitForSelector('#input-for-name', { visible: true, timeout: 15000 });
      console.log('Display name input field found inside iframe. Entering display name...');
      await iframeContent.type('#input-for-name', displayName);
      await iframeContent.waitForSelector('button.preview-join-button', { visible: true, timeout: 15000 });
await iframeContent.click('button.preview-join-button');


      console.log('Display name entered and submitted.');
    } else {
      console.log('No iframe detected for display name, continuing normal flow...');
      await page.waitForSelector('#input-for-name', { visible: true, timeout: 15000 });
      await page.type('#input-for-name', displayName);
      await page.click('#btnSubmit');
      console.log('Display name entered and submitted.');
    }
  } catch (error) {
    console.log('Display name input field not found within the given time.');
  }

  console.log('Joined the Zoom meeting successfully.');
 
  
  // audio starts here
  console.log("Starting audio recording...");
  const ffmpegProcess = exec(
    `ffmpeg -f dshow -i audio="Stereo Mix (Realtek(R) Audio)" -ac 1 -b:a 32k -ar 16000 -acodec libmp3lame ${AUDIO_FILE}`,
    (error) => {
      if (error) console.error("FFmpeg error:", error);
    }
  );
  
  // Let the bot stay in the meeting for 60 seconds
  await page.waitForTimeout(60000);
  
  // Stop recording
  console.log("Stopping audio recording...");
  ffmpegProcess.stdin.write("q"); // Gracefully stop FFmpeg
  
  setTimeout(() => {
    ffmpegProcess.kill("SIGKILL"); // Force kill if not exited
    console.log(`Audio saved at: ${AUDIO_FILE}`);
  }, 3000);
  
  
  // Close browser
  await browser.close();
  uploadAudio();
};

// ✅ Correctly export the function


// Define meeting details
const meetingId = '87681662669';  // Remove spaces if needed
const passcode = 'd4KHL8';
const displayName = 'clarifi';

// Call the function
//joinZoomMeeting(meetingId, passcode, displayName)
//  .then(() => console.log('Test completed successfully.'))
//  .catch((error) => console.error('Test failed:', error));

async function uploadAudio() {
    console.log(`Uploading: ${AUDIO_FILE}`);
    
    if (!fs.existsSync(AUDIO_FILE)) {
        console.error("Error: Audio file does not exist!");
        return;
    }
    
    // Step 1: Split the audio into small chunks using ffmpeg
    const chunkDuration = 20; // in seconds, adjust based on your needs
    const totalDuration = await getAudioDuration(AUDIO_FILE); // Get the total duration of the audio file
    let chunks = [];
    
    for (let startTime = 0; startTime < totalDuration; startTime += chunkDuration) {
        const chunkFileName = `chunk_${startTime}.mp3`;
        const chunk = await splitAudio(AUDIO_FILE, startTime, chunkDuration, chunkFileName);
        chunks.push(chunk);
    }
    
    // Step 2: Upload each chunk to Cloudflare Worker and print the result
    for (const chunk of chunks) {
        await uploadChunk(chunk);
    }
}

// Function to get the total duration of the audio in seconds using ffmpeg
function getAudioDuration(audioFile) {
    return new Promise((resolve, reject) => {
        exec(`ffmpeg -i "${audioFile}" -f null -`, (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }

            // Extract the duration from the stderr output
            const durationMatch = stderr.match(/Duration: (\d+:\d+:\d+\.\d+)/);
            if (durationMatch) {
                const durationString = durationMatch[1];
                const [hours, minutes, seconds] = durationString.split(':').map(Number);
                const totalSeconds = hours * 3600 + minutes * 60 + seconds;
                resolve(totalSeconds);
            } else {
                reject('Could not extract duration');
            }
        });
    });
}


// Function to split the audio file into chunks
function splitAudio(audioFile, startTime, duration, outputFile) {
    return new Promise((resolve, reject) => {
        exec(`ffmpeg -ss ${startTime} -t ${duration} -i ${audioFile} -acodec mp3 -y ${outputFile}`, (error, stdout, stderr) => {
            if (error) {
                reject(`Error splitting audio: ${stderr}`);
                return;
            }
            resolve(outputFile); // Return the path of the chunk file
        });
    });
}

// Function to upload the chunk to Cloudflare
async function uploadChunk(chunkFile) {
    console.log(`Uploading chunk: ${chunkFile}`);
    
    if (!fs.existsSync(chunkFile)) {
        console.error(`Error: Chunk file ${chunkFile} does not exist!`);
        return;
    }
    
    const audioBuffer = fs.readFileSync(chunkFile);
    
    const response = await fetch(CLOUDFLARE_WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "audio/mpeg" },
        body: audioBuffer
    });
    
    // ✅ Log the raw response before parsing
    const rawText = await response.text();
    console.log("Raw response from Cloudflare Worker:", rawText);
    
    try {
        const result = JSON.parse(rawText);
        console.log("Transcribed Text:", result.response);
    } catch (error) {
        console.error("JSON Parsing Error:", error);
    }
    
    // Clean up the chunk file after upload
    fs.unlinkSync(chunkFile);
}
uploadAudio();