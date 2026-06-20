require('dotenv').config();
const { Client, RemoteAuth } = require('whatsapp-web.js');
const mongoose = require('mongoose');
const { MongoStore } = require('wwebjs-mongo');
const cron = require('node-cron');
const express = require('express');
const cors = require('cors');
const path = require('path');
const { getSheetData } = require('./sheets');

// =============================================
// MONGODB SCHEMAS & SETUP
// =============================================

const leadSchema = new mongoose.Schema({
    number: String,
    name: String,
    business: String,
    variant: String,
    sentAt: Date
});

const Lead = mongoose.model('Lead', leadSchema);

// =============================================
// EXPRESS WEB SERVER (DASHBOARD)
// =============================================

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Global state variables for the dashboard
let botStatus = 'starting'; // starting, qr, ready
let currentQrCode = null;

app.get('/api/stats', async (req, res) => {
    try {
        // Fetch data
        const totalLeadsData = await getSheetData();
        const totalLeads = totalLeadsData.length;
        
        const sentLeads = await Lead.find({}).sort({ sentAt: -1 }).exec();
        const sentDms = sentLeads.length;
        const pendingDms = totalLeads - sentDms;
        
        const variantA = sentLeads.filter(l => l.variant === 'A').length;
        const variantB = sentLeads.filter(l => l.variant === 'B').length;

        res.json({
            status: botStatus,
            qrCode: currentQrCode,
            totalLeads,
            sentDms,
            pendingDms: pendingDms > 0 ? pendingDms : 0,
            variantA,
            variantB,
            recentActivity: sentLeads.slice(0, 10) // Send top 10 most recent
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🌐 Dashboard running on port ${PORT}`);
});


// =============================================
// A/B TEST MESSAGE TEMPLATES
// =============================================

function generateMessageA(name) {
    return `Hi ${name}, hope your week is going well! 😊\n\nI help businesses solve a really common problem: missing customer calls during busy hours or after closing time\n\nWe set up AI Phone Assistants that answer your business line instantly. It greets callers naturally, answers their questions, and even books appointments automatically so you never lose a lead.\n\nIt works in the background while you and your team focus on your actual work.\n\nIf you're curious, are you open to a quick 5-minute Zoom or WhatsApp call this week to see how it works? Let me know what day works best for you!`;
}

function generateMessageB(name) {
    return `Hi ${name}, hope your week is going well! 😊\n\nHow many customers are you losing right now to a boring website or a missed phone call?\n\nWe help businesses fix this instantly by setting up an animated website paired with a 24/7 AI Phone Assistant. This powerful combo grabs attention online and answers your phones instantly—booking clients and answering questions 24/7 so you never lose a single dollar to your competitors.\n\n(We offer these together as a powerful package, but you can also choose just one individual service if that fits your business better right now!)\n\nAre you open to a quick 5-minute Zoom or WhatsApp call this week to see how this can get you more clients? Let me know what day works best! 📞💻`;
}

function generateMessage(lead, variant) {
    const name = lead.ownerName || lead.businessName || 'there';
    if (variant === 'B') return generateMessageB(name);
    return generateMessageA(name);
}

// Helper for delay (sleep)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function formatPhoneNumber(number) {
    let cleanNumber = number.replace(/\D/g, ''); 
    if (cleanNumber.length === 12 && cleanNumber.startsWith('91')) return `${cleanNumber}@c.us`; 
    if (cleanNumber.length === 10) return `91${cleanNumber}@c.us`;
    return `${cleanNumber}@c.us`;
}

// =============================================
// WHATSAPP BOT LOGIC
// =============================================

async function startBot() {
    // 1. Connect to MongoDB
    if (!process.env.MONGODB_URI) {
        console.error('❌ MONGODB_URI is not set in .env!');
        process.exit(1);
    }
    
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // 2. Setup RemoteAuth Store
    const store = new MongoStore({ mongoose: mongoose });

    // 3. Initialize WhatsApp Client
    const client = new Client({
        authStrategy: new RemoteAuth({
            store: store,
            backupSyncIntervalMs: 300000 // Sync session every 5 mins
        }),
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'] // Required for cloud hosting (Render/Railway)
        }
    });

    client.on('qr', (qr) => {
        console.log('\n📱 NEW QR CODE GENERATED! Check your Web Dashboard to scan it.');
        botStatus = 'qr';
        currentQrCode = qr;
    });

    client.on('ready', () => {
        console.log('✅ WhatsApp Client is ready and connected!');
        botStatus = 'ready';
        currentQrCode = null; // Clear QR code
        
        // Schedule the daily job
        cron.schedule(process.env.POLL_SCHEDULE || '0 9 * * *', async () => {
            console.log('\n[CRON] Starting the daily check for new leads...');
            await processLeads(client);
        });

        // Run once on startup
        console.log('Running an initial check right now...');
        processLeads(client);
    });

    client.on('remote_session_saved', () => {
        console.log('☁️ WhatsApp Session saved to MongoDB securely.');
    });

    console.log('Starting WhatsApp Client... Please wait.');
    client.initialize();
}

async function processLeads(client) {
    try {
        const leads = await getSheetData();
        const sentLeadsDocs = await Lead.find({});
        const alreadyMessaged = sentLeadsDocs.map(l => l.number);
        
        let variantACount = sentLeadsDocs.filter(l => l.variant === 'A').length;
        let variantBCount = sentLeadsDocs.filter(l => l.variant === 'B').length;

        for (const lead of leads) {
            const formattedNumber = formatPhoneNumber(lead.phoneNumber);
            
            if (!alreadyMessaged.includes(formattedNumber)) {
                
                // A/B TEST LOGIC
                let variant;
                if (variantACount < 10) variant = 'A';
                else if (variantBCount < 10) variant = 'B';
                else variant = variantACount <= variantBCount ? 'A' : 'B';

                console.log(`\nNew lead found: ${lead.businessName} (${lead.phoneNumber})`);
                
                const messageText = generateMessage(lead, variant);

                const delayMs = Math.floor(Math.random() * (90000 - 30000 + 1)) + 30000;
                console.log(`Waiting for ${delayMs / 1000} seconds before sending (Safety Delay)...`);
                await sleep(delayMs);

                // Send the message
                await client.sendMessage(formattedNumber, messageText);
                console.log(`✅ Message (Variant ${variant}) successfully sent to ${lead.phoneNumber}`);
                
                // Save to MongoDB
                const newLead = new Lead({
                    number: formattedNumber,
                    name: lead.ownerName || lead.businessName,
                    business: lead.businessName,
                    variant: variant,
                    sentAt: new Date()
                });
                await newLead.save();

                alreadyMessaged.push(formattedNumber);
                if (variant === 'A') variantACount++;
                else variantBCount++;
            }
        }
    } catch (error) {
        console.error('Error during lead processing:', error);
    }
}

// Boot the system
startBot();
