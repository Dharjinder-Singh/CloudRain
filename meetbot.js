const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth"); 
const fs = require("fs");
const { spawn } = require("child_process");
require("dotenv").config();


const { exec } = require("child_process");
const path = require("path");
const fetch = require("node-fetch");
const AUDIO_FILE="C:\\Users\\91939\\Desktop\\WorkersGonnaWork\\CloudRain\\audio_file\\abc.mp3";
const CLOUDFLARE_WORKER_URL = " https://inworkers.gobardan1707.workers.dev";

// ✅ Create an instance of the stealth plugin
const stealth = StealthPlugin();

// ✅ Modify evasions properly
stealth.enabledEvasions.delete("iframe.contentWindow");
stealth.enabledEvasions.delete("media.codecs");

// ✅ Apply the plugin
puppeteer.use(stealth);
// Google Account Credentials
const EMAIL = process.env.GOOGLE_EMAIL;
const PASSWORD = process.env.GOOGLE_PASSWORD;
const MEET_URL = process.env.MEET_URL; // Set your Google Meet link

// Function to Start Puppeteer & Join Meet
async function startMeetBot() {
  
        args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"]

        const browser = await puppeteer.launch({
            headless: false,
            args: [
                "--use-fake-ui-for-media-stream",
                "--use-fake-device-for-media-stream",
                "--disable-features=MediaStream",
                "--disable-blink-features=MediaStream",
                "--deny-permission-prompts"
            ]
        });


    

    const page = await browser.newPage();
    
    // Refuse camera and microphone permissions
    const context = browser.defaultBrowserContext();
    await context.overridePermissions(MEET_URL, []); // No permissions granted permission not granted 
    await context.overridePermissions(MEET_URL, ["notifications"]);
    
    // Login Process
    await page.goto("https://accounts.google.com/signin");
    await page.waitForSelector('input[type="email"]');
    await page.type('input[type="email"]', EMAIL);
    await page.keyboard.press("Enter");
    
    await page.waitForSelector('input[type="password"]', { visible: true });
    await page.type('input[type="password"]', PASSWORD);
    await page.keyboard.press("Enter");
    await page.waitForNavigation();

    // Navigate to Meet
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
        });
      });
    await page.goto(MEET_URL);
    await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
      );

      
      
    await page.waitForSelector('button', { visible: true, timeout: 30000 });
     
/*const buttons = await page.$$('button');
for (const button of buttons) {
    const text = await page.evaluate(el => el.innerText, button);
    if (text.toLowerCase().includes("join now")) {
        //await page.waitForSelector('selector', { visible: true });
        if (button) {
            await button.click();
            console.log("Joined Google Meet!");
            return;
          }
       
    }
}*/
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
    console.log(`⚠️ Dialog detected: ${dialog.message()}`);
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


try {
    console.log("Waiting for the 'Ask to Join' button...");

    // Wait for the button containing 'Ask to Join' or 'Join Now' text
    const joinButton = await page.waitForFunction(
        () => {
            const buttons = Array.from(document.querySelectorAll("button"));
            return buttons.find(button => 
                button.innerText.trim().toLowerCase().includes("ask to join") || 
                button.innerText.trim().toLowerCase().includes("join now")
            );
        }, 
        { timeout: 300000 } // 5-minute timeout
    );

    try {
        console.log("⏳ Waiting for the 'Continue without microphone and camera' button...");
        
        await page.waitForSelector('button', { visible: true, timeout: 10000 });
    
        const buttons = await page.$$("button");
    
        for (const button of buttons) {
            const text = await page.evaluate(el => el.innerText.trim().toLowerCase(), button);
            
            if (text.includes("continue without microphone and camera")) {
                console.log("✅ Found the button, clicking it...");
                await button.click();
                break;
            }
        }
    
        console.log("🎉 Successfully bypassed the audio/video prompt.");
    } catch (error) {
        console.log("⚠️ No 'Continue without microphone and camera' button appeared.");
    }
    

    if (joinButton) {
        console.log("Button found, scrolling into view...");
        await page.evaluate(el => el.scrollIntoView(), joinButton);

        // ✅ Replace waitForTimeout with a proper delay
        await new Promise(resolve => setTimeout(resolve, 1000)); 

        console.log("Attempting to click the button...");
        await page.evaluate(el => el.click(), joinButton);

        console.log("Joined Google Meet!");

        console.log("Starting audio recording...");
  const ffmpegProcess = exec(
    `ffmpeg -f dshow -i audio="Stereo Mix (2- Realtek(R) Audio)" -ac 1 -b:a 32k -ar 16000 -acodec libmp3lame ${AUDIO_FILE}`,
    (error) => {
      if (error) console.error("FFmpeg error:", error);
    });
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
        
    } else {
        console.log("Join button not found!");
    }
} catch (err) {
    console.error("Error while trying to click the button:", err);
}

// ✅ Replace global `page.waitForTimeout(3600000)` with:
/* await new Promise(resolve => setTimeout(resolve, 3600000)); // 1 hour delay

    // Capture audio using FFmpeg
    startAudioCapture();

    // Keep the bot running
    await page.waitForTimeout(3600000); // 1 hour */
}

// Function to Capture Audio via FFmpeg & Stream (unchanged)



// Start the bot
startMeetBot();




    // Capture audio using FFmpeg
  //uploadAudio();
    

    // Keep the bot running
    //await page.waitForTimeout(3600000); // 1 hour


// Function to Capture Audio via FFmpeg & Stream (unchanged)
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
    let cnt=1;
    for (const chunk of chunks) {
        await uploadChunk(chunk,chunks.length,cnt);
        cnt++;
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
async function uploadChunk(chunkFile,totalChunks,curr) {
    console.log(`Uploading chunk: ${chunkFile}`);
    
    if (!fs.existsSync(chunkFile)) {
        console.error(`Error: Chunk file ${chunkFile} does not exist!`);
        return;
    }
    
    const audioBuffer = fs.readFileSync(chunkFile);
    
    const response = await fetch(CLOUDFLARE_WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "audio/mpeg" },
        headers: {
          'Content-Type': 'audio/mpeg',
          'X-Total-Chunks': totalChunks.toString(), // Send total number of chunks
          'X-Current-Chunk': curr.toString()     // Send current chunk number
      },
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
//uploadAudio();