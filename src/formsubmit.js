import HTMLInteractionExtractor from './interaction.js';

export class FormHandler {
    constructor(context, options = {}) {
        this.context = context;
        this.timeout = options.timeout || 5000;
        this.debug = options.debug || false;
    }

    log(...args) {
        if (this.debug) console.log('[FormHandler]', ...args);
    }

    normalizeText(value) {
        return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
    }

    formSignature(form) {
        const attributes = form?.attributes || {};
        return [
            form?.action || '',
            form?.method || '',
            attributes.id || '',
            attributes.name || '',
            attributes.class || '',
            form?.inputs?.length || 0,
            form?.buttons?.length || 0,
        ].map((part) => this.normalizeText(part)).join('|');
    }

    async extractForms(page) {
        const html = await page.content();
        const extractor = new HTMLInteractionExtractor(html);
        return extractor.extract().forms || [];
    }

    resolveUrl(action, baseUrl) {
        try {
            return new URL(action, baseUrl).href;
        } catch {
            return baseUrl;
        }
    }

    generateSampleValue(input) {
        const type = input.type || 'text';
        const name = input.name || '';
        const id = input.attributes?.id || '';
        const tagName = input.attributes?.tagName?.toLowerCase() || '';
        const lowerName = (name + id).toLowerCase();

        // Handle textarea
        if (tagName === 'textarea') {
            if (lowerName.includes('message') || lowerName.includes('comment') || lowerName.includes('description')) {
                return 'This is a sample message or comment. It can be multiple lines of text.';
            }
            if (lowerName.includes('bio') || lowerName.includes('about')) {
                return 'This is a sample biography or description text.';
            }
            return 'Sample textarea content';
        }

        // Handle select
        if (tagName === 'select') {
            // For multiple select, return array
            if (input.attributes?.multiple) {
                return ['option1', 'option2'];
            }
            // For single select, return first option value or default
            return 'option1';
        }

        switch (type) {
            case 'email':
                return 'sample@example.com';
            case 'password':
                return 'SamplePass123!';
            case 'number':
                return '42';
            case 'tel':
            case 'phone':
                return '+1234567890';
            case 'url':
                return 'https://example.com';
            case 'date':
                return '2024-01-01';
            case 'time':
                return '12:00';
            case 'datetime-local':
                return '2024-01-01T12:00';
            case 'month':
                return '2024-01';
            case 'week':
                return '2024-W01';
            case 'color':
                return '#ff0000';
            case 'range':
                return '50';
            case 'checkbox':
                return true;
            case 'radio':
                return input.attributes?.value || 'option1';
            case 'file':
                // Cannot programmatically set file input value for security reasons
                // Return null to skip file inputs
                return null;
            case 'hidden':
                // Hidden inputs typically have values, but provide default
                return 'hidden_value';
            case 'text':
            case 'search':
            default:
                if (lowerName.includes('email')) return 'sample@example.com';
                if (lowerName.includes('name')) return 'Sample Name';
                if (lowerName.includes('first')) return 'John';
                if (lowerName.includes('last')) return 'Doe';
                if (lowerName.includes('user')) return 'sampleuser';
                if (lowerName.includes('age')) return '25';
                if (lowerName.includes('phone') || lowerName.includes('tel')) return '+1234567890';
                if (lowerName.includes('zip') || lowerName.includes('postal')) return '12345';
                if (lowerName.includes('city')) return 'New York';
                if (lowerName.includes('country')) return 'United States';
                if (lowerName.includes('address')) return '123 Main Street';
                if (lowerName.includes('search') || lowerName.includes('query') || lowerName.includes('q')) return 'sample query';
                if (lowerName.includes('message') || lowerName.includes('comment')) return 'This is a sample message';
                if (lowerName.includes('browser')) return 'Chrome';
                return 'sample text';
        }
    }

    async newPage(baseUrl) {
        const page = await this.context.newPage();
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: this.timeout });
        return page;
    }

    getInputSelector(input) {
        const tagName = input.attributes?.tagName?.toLowerCase();
        
        if (input.attributes?.id) return `#${input.attributes.id}`;
        if (input.name) {
            // Add tag name for better specificity
            if (tagName === 'textarea') return `textarea[name="${input.name}"]`;
            if (tagName === 'select') return `select[name="${input.name}"]`;
            return `[name="${input.name}"]`;
        }
        if (input.type) return `input[type="${input.type}"]`;
        if (tagName === 'textarea') return 'textarea';
        if (tagName === 'select') return 'select';
        return 'input';
    }

    getButtonSelector(button, index) {
        if (button?.name) return `[name="${button.name}"]`;
        if (button?.attributes?.id) return `#${button.attributes.id}`;
        if (button?.type === 'submit') return `button[type="submit"]:nth-of-type(${index + 1})`;
        return `button:nth-of-type(${index + 1})`;
    }

    processInputs(inputs = []) {
        return inputs.map((input) => {
            const processedInput = { ...input };
            if (!processedInput.value) processedInput.value = this.generateSampleValue(input);
            processedInput.selector = this.getInputSelector(input);
            return processedInput;
        });
    }

    async fillForm(page, form, processedInputs) {
        this.log(`Filling form: ${form.attributes?.id || 'unnamed form'}`);

        for (const input of processedInputs) {
            try {
                // Skip file inputs (cannot be set programmatically)
                if (input.type === 'file') {
                    this.log(`Skipping file input: ${input.selector}`);
                    continue;
                }

                // Skip inputs with null value
                if (input.value === null || input.value === undefined) {
                    this.log(`Skipping input with no value: ${input.selector}`);
                    continue;
                }

                await page.waitForSelector(input.selector, { timeout: this.timeout });
                
                const tagName = input.attributes?.tagName?.toLowerCase();

                if (input.type === 'checkbox') {
                    // Check if checkbox should be checked
                    if (input.value) await page.check(input.selector);
                    else await page.uncheck(input.selector);
                } else if (input.type === 'radio') {
                    await page.check(input.selector);
                } else if (input.type === 'hidden') {
                    // Hidden inputs - try to set with evaluate
                    await page.evaluate((selector, value) => {
                        const el = document.querySelector(selector);
                        if (el) el.value = value;
                    }, input.selector, String(input.value));
                } else if (tagName === 'select' || input.type === 'select') {
                    // Handle select - check if multiple
                    const isMultiple = input.attributes?.multiple;
                    if (isMultiple && Array.isArray(input.value)) {
                        await page.selectOption(input.selector, input.value);
                    } else {
                        await page.selectOption(input.selector, String(input.value));
                    }
                } else if (tagName === 'textarea') {
                    // Textarea
                    await page.fill(input.selector, String(input.value));
                } else {
                    // Default: text, email, password, number, tel, url, search, date, time, etc.
                    await page.fill(input.selector, String(input.value));
                }
            } catch (error) {
                this.log(`Skip input ${input.selector}: ${error.message}`);
            }
        }
    }

    async submitForm(page, button, index) {
        const selector = this.getButtonSelector(button, index);
        try {
            const handle = await page.$(selector);
            if (handle) {
                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: this.timeout }).catch(() => null),
                    handle.click(),
                ]);
                return true;
            }

            await page.evaluate(() => {
                const form = document.querySelector('form');
                if (form) form.submit();
            });
            return true;
        } catch (error) {
            this.log(`Submit failed for ${selector}: ${error.message}`);
            return false;
        }
    }

    async submitAndExploreFollowUpForms(page, baseUrl) {
        const processedCounts = new Map();
        const maxRounds = 25;

        for (let round = 0; round < maxRounds; round += 1) {
            const forms = await this.extractForms(page);
            let nextTarget = null;
            const seenCounts = new Map();

            for (const form of forms) {
                const signature = this.formSignature(form);
                const occurrenceIndex = seenCounts.get(signature) || 0;
                seenCounts.set(signature, occurrenceIndex + 1);

                const processedCount = processedCounts.get(signature) || 0;
                if (occurrenceIndex >= processedCount && !nextTarget) {
                    nextTarget = {
                        form,
                        signature,
                    };
                }
            }

            if (!nextTarget) {
                break;
            }

            const processedInputs = this.processInputs(nextTarget.form.inputs || []);
            const button = nextTarget.form.buttons?.length ? nextTarget.form.buttons[0] : null;

            try {
                await this.fillForm(page, nextTarget.form, processedInputs);
                await this.submitForm(page, button, 0);
            } catch (error) {
                this.log(`Follow-up form failed: ${error.message}`);
                break;
            }

            processedCounts.set(nextTarget.signature, (processedCounts.get(nextTarget.signature) || 0) + 1);

            await page.waitForTimeout(300);
        }

        return page.url() || baseUrl;
    }

    async handleForm(form, baseUrl) {
        const targetUrl = this.resolveUrl(form.action, baseUrl);
        const processedInputs = this.processInputs(form.inputs || []);
        const buttons = form.buttons?.length ? form.buttons : [null];
        const results = [];

        for (let index = 0; index < buttons.length; index += 1) {
            const button = buttons[index];
            const page = await this.newPage(baseUrl);
            const result = {
                button: button?.value || button?.text || null,
                status: null,
                finalUrl: null,
                error: null,
            };

            try {
                await this.fillForm(page, form, processedInputs);
                const submitted = await this.submitForm(page, button, index);
                if (submitted) {
                    await this.submitAndExploreFollowUpForms(page, baseUrl);
                    result.status = 200;
                    result.finalUrl = page.url();
                }
            } catch (error) {
                result.error = error.message;
            } finally {
                await page.close();
            }

            results.push(result);
        }

        return {
            action: form.action,
            method: form.method,
            targetUrl,
            results,
        };
    }

    async handleForms(forms, baseUrl) {
        const allResults = [];
        for (const form of forms || []) {
            allResults.push(await this.handleForm(form, baseUrl));
        }
        return allResults;
    }
}
