const { google } = require('googleapis');

// Connect to Google Sheets
async function getSheetData() {
    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: './credentials.json', // The key file from Google Cloud
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });

        const client = await auth.getClient();
        const googleSheets = google.sheets({ version: 'v4', auth: client });

        const spreadsheetId = process.env.GOOGLE_SHEET_ID;
        const range = process.env.GOOGLE_SHEET_RANGE || 'Sheet1!A2:E';

        const response = await googleSheets.spreadsheets.values.get({
            spreadsheetId,
            range,
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            console.log('No data found in Google Sheet.');
            return [];
        }

        // Map rows to objects
        // Assuming columns: A=Business Name, B=Owner Name, C=Phone Number, D=Email, E=Website
        return rows.map((row, index) => ({
            rowIndex: index + 2, // +2 because A2 is index 0
            businessName: row[0] || '',
            ownerName: row[1] || '',
            phoneNumber: row[2] || '',
            email: row[3] || '',
            website: row[4] || ''
        })).filter(lead => lead.phoneNumber !== ''); // Only return rows that actually have a phone number

    } catch (error) {
        console.error('Error fetching data from Google Sheets:', error.message);
        return [];
    }
}

module.exports = { getSheetData };
