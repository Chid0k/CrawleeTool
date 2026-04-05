// For more information, see https://crawlee.dev/

import { PlaywrightCrawler, ProxyConfiguration, Dataset } from 'crawlee';
import HTMLInteractionExtractor from './interaction.js';
import { FormHandler } from './formsubmit.js';
import { handleClickable } from './buttonsubmit.js';


// Config
const startUrls = ['https://lmsattt.ptit.edu.vn']; 

const exceptionUrls = ['https://lmsattt.ptit.edu.vn:443/login/logout.php'];

const proxyConfiguration = new ProxyConfiguration({
    proxyUrls: [
        'http://0.0.0.0:8080',
    ]
});

const blockedExtensions = [
                    '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
                    '.bmp', '.ico', '.tif', '.tiff', '.zip', '.rar', '.7z',
                    '.tar', '.gz', '.mp3', '.mp4', '.avi', '.mov', '.wmv', 
                    '.docx', '.xlsx', '.pptx', '.doc', '.xls', '.ppt', '.js'
                ];

const cookies  =   [
                {
                    name: 'MoodleSession',
                    value: 'p1bcb46mh12n15etp2j4d5jte4',
                    domain: 'lmsattt.ptit.edu.vn',
                    path: '/',
                    httpOnly: false,
                    secure: true,
                },
            ];

// Added funtions
function normalizeUrlForMatch(url) {
    try {
        const parsed = new URL(url);
        return `${parsed.protocol}//${parsed.host}${parsed.pathname}`.toLowerCase().replace(/\/$/, '');
    } catch {
        return String(url).toLowerCase().replace(/\/$/, '');
    }
}

function isExceptionUrl(currentUrl) {
    const normalizedCurrentUrl = normalizeUrlForMatch(currentUrl);
    return exceptionUrls.some((exceptionUrl) => {
        const normalizedExceptionUrl = normalizeUrlForMatch(exceptionUrl);
        return normalizedCurrentUrl.startsWith(normalizedExceptionUrl);
    });
}

function buttonSignature(button) {
    const attributes = button?.attributes || {};
    return [
        button?.type || '',
        button?.name || '',
        button?.value || '',
        button?.text || '',
        attributes.id || '',
        attributes.class || '',
        attributes.onclick || '',
        attributes.tagName || '',
    ].map((part) => String(part).trim().toLowerCase()).join('|');
}

async function processDynamicButtons(page, baseUrl) {
    const processedCounts = new Map();
    const maxClicks = 50;

    await page.goto(baseUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 10000,
    });

    for (let clickCount = 0; clickCount < maxClicks; clickCount += 1) {
        const html = await page.content();
        const extractor = new HTMLInteractionExtractor(html);
        const buttons = extractor.extract().buttons || [];

        const seenCounts = new Map();
        let nextTarget = null;

        for (let index = 0; index < buttons.length; index += 1) {
            const button = buttons[index];
            const signature = buttonSignature(button);
            const occurrenceIndex = seenCounts.get(signature) || 0;
            seenCounts.set(signature, occurrenceIndex + 1);

            const processedCount = processedCounts.get(signature) || 0;
            if (occurrenceIndex >= processedCount && !nextTarget) {
                nextTarget = {
                    button,
                    signature,
                    occurrenceIndex,
                };
            }
        }

        if (!nextTarget) {
            break;
        }

        const result = await handleClickable(page, nextTarget.button, nextTarget.occurrenceIndex);
        processedCounts.set(nextTarget.signature, (processedCounts.get(nextTarget.signature) || 0) + 1);

        if (!result.clicked && !result.navigation) {
            break;
        }

        await page.waitForTimeout(300);
    }
}


// Create an instance of the crawler and run it
const crawler = new PlaywrightCrawler({

    minConcurrency: 5,

    maxConcurrency: 7,

    browserPoolOptions: {
        maxOpenPagesPerBrowser: 2, 
        retireBrowserAfterPageCount: 50, 
    },

    proxyConfiguration,
    
    maxRequestsPerCrawl: 1000,
    
    launchContext: {
        launchOptions: {
            args: ['--ignore-certificate-errors', '--ignore-ssl-errors'],  // bypass SSL errors
            headless: false,
        }
        
    },

    preNavigationHooks: [
        async ({ page }) => {
            await page.context().addCookies(cookies);
        },
    ],

    

    async requestHandler({ page, request, enqueueLinks }) {

        // Rendering
        await page.waitForTimeout(1000);
        const html = await page.content();
        console.log(`Enqueueing links from: ${request.url}`);
        
        // Extract interactions
        const extractor = new HTMLInteractionExtractor(html);
        const interactions = extractor.extract();
        // console.log(`View interactions: ${JSON.stringify(interactions, null, 2)}`);

        // ========================= Handle links, form, button =========================
        // Add link the queue
        const linksToEnqueue = interactions.links.map(link => link.href);
        const baseUrl = request.loadedUrl || request.url;
        const requestsToEnqueue = linksToEnqueue.map((link, i) => {
            let absoluteUrl;
            try {
                absoluteUrl = new URL(link, baseUrl).href;
                const parsedUrl = new URL(absoluteUrl);
                if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
                    return null;
                }
            } catch (error) {
                return null; 
            }
            return {
                url: absoluteUrl,
                uniqueKey: `${absoluteUrl}#${i}`,
            };
        }).filter(Boolean);

        if (requestsToEnqueue.length > 0) {
            // Add condition to add manual URL
            // await crawler.addRequests(requestsToEnqueue, {
            //     forefront: true,
            // });
        }
        // console.log(`Requests to enqueue: ${JSON.stringify(requestsToEnqueue, null, 2)}`);

        // Submit forms
        // console.log(`Form information: ${JSON.stringify(interactions.forms, null, 2)}`);
        const results = await new FormHandler(page.context()).handleForms(interactions.forms, baseUrl);
        // console.log(`Form submission results: ${JSON.stringify(results, null, 2)}`);
        
        
        //Button clicks
        // console.log(`Button interactions: ${JSON.stringify(interactions.buttons, null, 2)}`);
        if (interactions.buttons) {
            const context = page.context();
            const originalUrl = baseUrl;
            let buttonPage = null;
            try {
                buttonPage = await context.newPage();
                await processDynamicButtons(buttonPage, originalUrl);
            } catch (error) {
                console.log('Error:', error);
                return null;
            } finally {
                if (buttonPage) {
                    await buttonPage.close();
                }
            }
        }


        // ================== Enqueue links ==================
        // Enqueue links from the same domain as the start URL
        await enqueueLinks({
            // globs: startUrls.map(url => url + '*'),
            strategy: 'same-domain', // ["all","same-hostname","same-domain","same-origin"]

            // Skip URLs that look like file downloads
            transformRequestFunction(req) {
                const url = req.url.toLowerCase();
                const isBlocked = blockedExtensions.some((extension) => url.endsWith(extension));
                try {
                    if (isBlocked) {
                        console.log(`Skip file-like URL: ${req.url}`);
                        return false;
                    }
                    if (isExceptionUrl(req.url)) {
                        console.log(`Skip exception URL: ${req.url}`);
                        return false;
                    }
                    return req;
                } catch (error) {
                    console.log('Error in transformRequestFunction:', error);
                    return false;
                } 
            }

        });
    },
});



console.log('==============START================');
await crawler.run(startUrls);
console.log('==============END==================');
