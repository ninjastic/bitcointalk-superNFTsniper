const axios = require('axios');
const fetch = require('node-fetch');
const FormData = require('form-data');
const cheerio = require('cheerio');
const fs = require('fs-extra');
const path = require('path');

const settings = require('../settings.json')

const api = axios.create({
    baseURL: 'https://bitcointalk.org',
    headers: {
        ["sec-fetch-dest"]: "document",
        ["sec-fetch-mode"]: "navigate",
        ["sec-fetch-site"]: "same-origin",
        ["sec-fetch-user"]: "?1"
    }
});

let LAST_REQUEST = null;
let INTERVAL_MS = 2000;
let REQUESTS = [];
let FINISHED = true;
let PROCESSING_REQUEST = false;

const queue = () => {
    setInterval(() => { 
        Promise.all(REQUESTS.map((request, index) => {
            REQUESTS.splice(index, 1);

            const interval = setInterval(async () => {
                if (PROCESSING_REQUEST) return;
                PROCESSING_REQUEST = true;

                if (!LAST_REQUEST) {
                    await request.function(request.params);
                    LAST_REQUEST = new Date();
                    PROCESSING_REQUEST = false;
                    clearInterval(interval);
                    return;
                }
    
                const NEXT_ALLOWED_REQUEST = new Date(LAST_REQUEST.getTime() + INTERVAL_MS);

                if (NEXT_ALLOWED_REQUEST > new Date()) {
                    PROCESSING_REQUEST = false;
                    return;
                }
    
                await request.function(request.params);
                LAST_REQUEST = new Date();
                PROCESSING_REQUEST = false;
                clearInterval(interval);
            }, INTERVAL_MS);
        }));
    }, 1000)
}

const logPurchase = async (text) => {
    const filePath = path.join(__dirname, '..', 'purchases.txt');
    const exists = await fs.pathExists(filePath);

    if (!exists) {
        await fs.writeFile(filePath, '');
    }

    const file = await fs.readFile(filePath);
    
    await fs.writeFile(filePath, `${file}\n${text}`);
}

const authenticate = async () => {
    const bodyFormData = new FormData();

    bodyFormData.append('user', settings.username);
    bodyFormData.append('passwrd', settings.password);
    bodyFormData.append('cookieneverexp', 'on');
    bodyFormData.append('hash_passwrd', '');

    const response = await fetch(
      `https://bitcointalk.org/index.php?action=login2;ccode=${settings.captchaCode}`,
      { method: 'POST', body: bodyFormData, redirect: 'manual' },
    );

    const data = await response.text();
    const guestHeader = data.match(/Welcome, <b>Guest<\/b>/);

    if (guestHeader) {
        return Promise.reject('Authentication failed.')
    }

    const cookies = response.headers.raw()['set-cookie'];

    if (cookies && cookies[0]) {
      console.log('Authentication successed.');
      api.defaults.headers.Cookie = `${cookies[0]}; ${cookies[1]}; ${cookies[2]}`;

      return Promise.resolve('Authenticated');
    }

    console.log('Authentication failed.');
    return Promise.reject('Authentication failed.');
}

const checkMarketForMatches = async () => {
    const response = await api.get('/fnft.php?buy');
    const $ = cheerio.load(response.data);

    const listingMatches = $('#helpmain > ul > li')
    .toArray()
    .reverse()
    .map(listing => {
        const html = $(listing).html();
        const text = $(listing).text();

        const priceRegex = html.match(/\((\d+) BTC\)/);
        const price = priceRegex && Number(priceRegex[1]);

        const nameRegex = text.match(/(.*) \(\d+ BTC\)/);
        const name = nameRegex && nameRegex[1];

        const linkRegex = html.match(/\[<a href="(.*)">Buy<\/a>/);
        const link = linkRegex && linkRegex[1];

        const level = name.match(/.+(\-.+)$/)[1].replace('-', '');

        if (
            (settings.rules[level] && settings.rules[level] >= price) ||
            settings.rules.ALL >= price
        ) {
            return {
                name,
                price,
                link
            };
        };

        return null;
    }).filter(element => element);

    return listingMatches;
}

const snipe = async (listing) => {
    console.log(`$ Trying to buy ${listing.name} for ${listing.price} BTC`);
    const response = await api.get(listing.link);

    const $ = cheerio.load(response.data);
    const errorElement = $('#bodyarea > div:nth-child(1) > table > tbody td[style*="padding: 3ex"]').html();
    const error = errorElement && errorElement.trim();

    const boughtElement = $('#helpmain').html();
    const bought = boughtElement && boughtElement.trim().match(/(Purchased\.)<hr>/)[1];

    if (error) {
        console.log(`> Errored: ${error}`);
    } else if (bought) {
        logPurchase(`${listing.name},${listing.price}`);
        console.log(bought);
    }
}

(async () => {
    console.log('Authenticating...');
    const authenticated = await authenticate();

    if (!authenticated) {
        process.exit();
    }

    console.log('Requesting fix for sesc code...')
    await api.get('/fnft.php?buyc=999999&amp;r=9&amp;p=9999&amp;s=18321&am;sesc=XXXXXXXXXX');

    const response = await api.get('/fnft.php');
    const $ = cheerio.load(response.data);
    const balance = $.html().match(/You have (\d+) BTC/);
    console.log(balance[0])

    Object.keys(settings.rules).map(key => {
        if (Number(balance[1]) < settings.rules[key]) {
            console.log(`Alert: You can't buy any ${key} NFT for <= ${settings.rules[key]} BTC because of your lower balance.`)
        }
    })

    setInterval(async () => {
        if (!FINISHED) return;
        FINISHED = false;

        console.log('Checking for new listings to snipe...')
        const listingMatches = await checkMarketForMatches();

        console.log(`Found ${listingMatches.length} listing(s) to snipe!`)
    
        await Promise.all(
            listingMatches.map(async listing => {
                REQUESTS.push({
                    params: listing,
                    function: async (listing) => await snipe(listing)
                });
            })
        );

        FINISHED = true;
    }, 5000);

    queue();
})()