const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth"); 
const fs = require("fs");
const { spawn } = require("child_process");
const WebSocket = require("ws");
require("dotenv").config();

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
    const browser = await puppeteer.launch({
        headless: false, // Set to true if running on a server
        args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"]
    });
    

    const page = await browser.newPage();
    
    // Refuse camera and microphone permissions
    const context = browser.defaultBrowserContext();
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
     
const buttons = await page.$$('button');
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
}


    // Capture audio using FFmpeg
    startAudioCapture();

    // Keep the bot running
    await page.waitForTimeout(3600000); // 1 hour
}

// Function to Capture Audio via FFmpeg & Stream (unchanged)
function startAudioCapture() {
    console.log("Starting audio capture...");

    const ffmpeg = spawn("ffmpeg", [
        "-f", "dshow",
        "-i", "audio=Stereo Mix (Realtek(R) Audio)",  // ✅ Capture system sound
        "-ac", "1",
        "-ar", "16000",
        "-f", "wav",
        "pipe:1"
    ]);
    

    const ws = new WebSocket("http://127.0.0.1:8787");

    ffmpeg.stdout.on("data", (data) => {
        ws.send(data);  // Stream audio to Cloudflare Worker
    });

    ws.on("open", () => {
        console.log("Connected to Cloudflare Worker.");
    });

    ws.on("error", (error) => {
        console.error("WebSocket Error:", error);
    });

    ffmpeg.stderr.on("data", (data) => {
        console.error("FFmpeg Error:", data.toString());
    });
}

// Start the bot
startMeetBot();