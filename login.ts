import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'path';

chromium.use(stealthPlugin());

const SESSION_PATH = path.join(process.cwd(), 'fb_session');

async function login() {
    console.log(`🚀 Launching browser with session path: ${SESSION_PATH}`);
    
    const context = await chromium.launchPersistentContext(SESSION_PATH, {
        headless: false,
        args: ['--start-maximized'],
        viewport: null
    });

    const page = await context.newPage();
    
    console.log('🌍 Navigating to Facebook Marketplace Creator...');
    await page.goto('https://www.facebook.com/marketplace/create/item');

    try {
        // Dry Run / Validation
        console.log('🔍 validating session...');
        // Waiting for a selector that appears when you are logged in and on the creation page
        // "Crear nueva publicación" usually implies a header or specific button specific to the logged-in state
        // We look for the main creation form container or the file input
        await page.waitForSelector('input[type="file"]', { timeout: 10000 });
        console.log('✅ Session Valid! "Upload Image" input found.');
        console.log('You can now manually log in if needed. The browser will remain open.');
    } catch (error) {
        console.log('⚠️ Session might be invalid or not logged in. Please log in manually.');
    }

    // Keep it open for manual interaction
    // await context.close(); 
}

login().catch(console.error);
