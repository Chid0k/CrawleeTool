## Create figerprint cho trình duyệt

```
import { PlaywrightCrawler } from 'crawlee';
import { BrowserName, DeviceCategory, OperatingSystemsName } from '@crawlee/browser-pool';

const crawler = new PlaywrightCrawler({
    browserPoolOptions: {
        useFingerprints: true, // this is the default
        fingerprintOptions: {
            fingerprintGeneratorOptions: {
                browsers: [{
                    name: BrowserName.edge,
                    minVersion: 96,
                }],
                devices: [
                    DeviceCategory.desktop,
                ],
                operatingSystems: [
                    OperatingSystemsName.windows,
                ],
            },
        },
    },
    // ...
});
```

## Form struct

```
[
  {
    "action": "/handle",
    "method": "POST",
    "attributes": {
      "action": "/handle",
      "method": "POST"
    },
    "inputs": [
      {
        "type": "text",
        "name": "name",
        "value": "Nguyễn Văn A",
        "attributes": {
          "type": "text",
          "name": "name",
          "value": "Nguyễn Văn A"
        }
      },
      {
        "type": "email",
        "name": "email",
        "value": "a@example.com",
        "attributes": {
          "type": "email",
          "name": "email",
          "value": "a@example.com"
        }
      }
    ],
    "buttons": [
      {
        "type": "submit",
        "name": "action",
        "value": "save",
        "text": "Save changes",
        "attributes": {
          "type": "submit",
          "name": "action",
          "value": "save"
        }
      },
      {
        "type": "submit",
        "name": "action",
        "value": "delete",
        "text": "Delete",
        "attributes": {
          "type": "submit",
          "name": "action",
          "value": "delete",
          "onclick": "return confirm('Bạn chắc chắn muốn xoá?')"
        }
      }
    ]
  }
]


```

xxx
```
// For more information, see https://crawlee.dev/

import { PlaywrightCrawler, ProxyConfiguration, launchPuppeteer } from 'crawlee';
import HTMLInteractionExtractor from './interaction.js';
import { FormHandler } from './formsubmit.js';
import { handleClickable } from './buttonsubmit.js';


// Config
const startUrls = ['http://localhost:9000']; 
const exceptionUrls = []; 
const proxyConfiguration = new ProxyConfiguration({
    proxyUrls: [
        'http://0.0.0.0:8080',
    ]
});
const blockedExtensions = [
                    // '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
                    // '.bmp', '.ico', '.tif', '.tiff', '.zip', '.rar', '.7z',
                    // '.tar', '.gz', '.mp3', '.mp4', '.avi', '.mov', '.wmv', 
                    // '.docx', '.xlsx', '.pptx', '.doc', '.xls', '.ppt',
                ];




// Create an instance of the crawler and run it
const crawler = new PlaywrightCrawler({

    minConcurrency: 5,

    maxConcurrency: 15,

    proxyConfiguration,
    
    maxRequestsPerCrawl: 1000,
    
    launchContext: {
        launchOptions: {
            args: ['--ignore-certificate-errors', '--ignore-ssl-errors'],  // bypass SSL errors
            headless: false,
        }
        
    },

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
            } catch (error) {
                return null; 
            }
            return {
                url: absoluteUrl,
                uniqueKey: `${absoluteUrl}#${i}`,
            };
        });
        // console.log(`Requests to enqueue: ${JSON.stringify(requestsToEnqueue, null, 2)}`);

        // Submit forms
        console.log(`Form information: ${JSON.stringify(interactions.forms, null, 2)}`);
        const results = await new FormHandler(page.context()).handleForms(interactions.forms, baseUrl);
        console.log(`Form submission results: ${JSON.stringify(results, null, 2)}`);
        
        
        //Button clicks
        // console.log(`Button interactions: ${JSON.stringify(interactions.buttons, null, 2)}`);
        if (interactions.buttons) {
            const context = page.context();
            const originalUrl = baseUrl;
            for (const button of interactions.buttons) {
                try {
                    const newPage = await context.newPage();
                    await newPage.goto(originalUrl);
                    const btnid = button.attributes.id
                        ? `#${button.attributes.id}`
                        : null;

                    if (!btnid) continue;
                    const result = await handleClickable(newPage, btnid);
                    await newPage.close();

                } catch (error) {
                    console.log('Error:', error);
                    return null;
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
                    if (exceptionUrls.includes(req.url)) {
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

```
