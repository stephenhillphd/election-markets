require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

// Use environment variable instead of hardcoding
const ODDS_API_KEY = process.env.ODDS_API_KEY;

if (!ODDS_API_KEY) {
    console.error('ODDS_API_KEY is not set in environment variables');
    process.exit(1);
}

app.use(cors());
app.use(express.static('public'));

// Add this helper function at the top of the file after the imports
function formatEasternTime(date) {
    return new Date(date).toLocaleString('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: true
    }) + ' ET';
}

app.get('/api/predictit', async (req, res) => {
    try {
        console.log('Attempting to fetch PredictIt data at:', formatEasternTime(new Date()));
        
        const url = 'https://www.predictit.org/api/marketdata/markets/7456';
        console.log('Fetching from URL:', url);
        
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'application/json',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout: 10000,
            validateStatus: false // Let's handle HTTP errors ourselves
        });
        
        console.log('PredictIt response received:', {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            dataType: typeof response.data
        });

        if (response.status !== 200) {
            throw new Error(`PredictIt API responded with status: ${response.status} (${response.statusText})`);
        }

        if (!response.data || !response.data.contracts) {
            console.error('Unexpected response structure:', response.data);
            throw new Error('Invalid response structure from PredictIt');
        }

        console.log('Successfully received data');
        console.log('Number of contracts:', response.data.contracts.length);
        console.log('Available contracts:', response.data.contracts.map(c => c.shortName).join(', '));
        
        res.json(response.data);
    } catch (error) {
        console.error('Detailed error:', {
            name: error.name,
            message: error.message,
            stack: error.stack,
            time: formatEasternTime(new Date()),
            response: error.response ? {
                status: error.response.status,
                statusText: error.response.statusText,
                data: error.response.data
            } : 'No response data'
        });
        
        res.status(500).json({ 
            error: 'Failed to fetch PredictIt data',
            details: error.message,
            time: formatEasternTime(new Date())
        });
    }
});

// Add new odds-api endpoint
app.get('/api/odds', async (req, res) => {
    try {
        console.log('Attempting to fetch odds data at:', formatEasternTime(new Date()));
        
        const url = 'https://api.the-odds-api.com/v4/sports/politics_us_presidential_election_winner/odds';
        const response = await axios.get(url, {
            params: {
                apiKey: ODDS_API_KEY,
                regions: 'us',
                markets: 'outrights',
                oddsFormat: 'decimal',
                dateFormat: 'iso'
            }
        });

        console.log('Odds API response received:', {
            status: response.status,
            statusText: response.statusText,
            dataLength: response.data.length,
            remainingRequests: response.headers['x-requests-remaining']
        });

        // Filter for Bovada and BetOnline
        const filteredData = response.data.map(event => ({
            ...event,
            bookmakers: event.bookmakers.filter(book => 
                ['bovada', 'betonlineag'].includes(book.key.toLowerCase()))
        }));

        res.json(filteredData);
    } catch (error) {
        console.error('Odds API error:', {
            name: error.name,
            message: error.message,
            response: error.response?.data
        });
        
        res.status(500).json({ 
            error: 'Failed to fetch odds data',
            details: error.message
        });
    }
});

// Add this after the /api/odds endpoint
app.get('/api/polymarket', async (req, res) => {
    try {
        console.log('Attempting to fetch Polymarket data at:', formatEasternTime(new Date()));
        
        const response = await axios.get('https://gamma-api.polymarket.com/events', {
            params: {
                slug: 'presidential-election-winner-2024'
            },
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.data || !response.data[0] || !response.data[0].markets) {
            console.error('Unexpected Polymarket response structure:', response.data);
            throw new Error('Invalid response structure from Polymarket');
        }

        const markets = response.data[0].markets;
        
        // Find markets for Trump and Harris
        const trumpMarket = markets.find(m => m.question.includes("Donald Trump"));
        const harrisMarket = markets.find(m => m.question.includes("Kamala Harris"));

        console.log('Trump market:', trumpMarket);
        console.log('Harris market:', harrisMarket);

        // Make sure we're working with arrays
        const trumpPrices = JSON.parse(trumpMarket.outcomePrices);
        const harrisPrices = JSON.parse(harrisMarket.outcomePrices);

        console.log('Parsed price arrays:', {
            trumpPrices,
            harrisPrices
        });

        const data = {
            trump: trumpPrices[0], // First price is YES
            harris: harrisPrices[0], // First price is YES
            timestamp: new Date().toISOString()
        };

        console.log('Final processed data:', data);
        res.json(data);
        
    } catch (error) {
        console.error('Polymarket API error:', {
            name: error.name,
            message: error.message,
            response: error.response?.data,
            stack: error.stack
        });
        
        res.status(500).json({ 
            error: 'Failed to fetch Polymarket data',
            details: error.message,
            time: formatEasternTime(new Date())
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        time: formatEasternTime(new Date())
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        details: err.message,
        time: formatEasternTime(new Date())
    });
});

app.listen(port, () => {
    console.log(`Server running on port ${port} at ${formatEasternTime(new Date())}`);
    console.log(`Try the health check at: http://localhost:${port}/health`);
}); 