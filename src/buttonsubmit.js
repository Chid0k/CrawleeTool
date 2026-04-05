function escapeForAttribute(value) {
    return String(value)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');
}

function normalizeText(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
}

function resolveButtonLocator(page, button, index = 0) {
    const attributes = button?.attributes || {};
    const candidates = [];

    if (button?.name) {
        candidates.push(page.locator(`[name="${escapeForAttribute(button.name)}"]`));
    }

    if (attributes.id) {
        candidates.push(page.locator(`#${escapeForAttribute(attributes.id)}`));
    }

    const accessibleName = normalizeText(button?.text || button?.value || button?.name || attributes.alt || '');
    if (accessibleName) {
        candidates.push(page.getByRole('button', { name: accessibleName }));
        candidates.push(page.locator(`button:has-text("${escapeForAttribute(accessibleName)}")`));
        candidates.push(page.locator(`input[type="submit"][value="${escapeForAttribute(accessibleName)}"]`));
        candidates.push(page.locator(`input[type="button"][value="${escapeForAttribute(accessibleName)}"]`));
        candidates.push(page.locator(`input[type="reset"][value="${escapeForAttribute(accessibleName)}"]`));
    }

    candidates.push(page.locator('button').nth(index));

    return candidates;
}

export async function handleClickable(page, button, index = 0) {
    const result = {
        navigation: false,
        requests: [],
        clicked: false,
        error: null,
    };


    const requests = [];
    const requestHandler = req => {
        requests.push({
            url: req.url(),
            method: req.method(),
            type: req.resourceType(),
            postData: req.postData(),
        });
    };

    page.on('request', requestHandler);

    try {
        const locators = resolveButtonLocator(page, button, index);
        let locator = null;

        for (const candidate of locators) {
            if (await candidate.count()) {
                locator = candidate.first();
                break;
            }
        }

        if (!locator) {
            result.error = 'Element not found';
            return result;
        }

        await locator.waitFor({
            state: 'attached',
            timeout: 3000,
        });


        await locator.scrollIntoViewIfNeeded();


        const navPromise = page.waitForNavigation({
            waitUntil: 'domcontentloaded',
            timeout: 5000,
        }).then(() => {
            result.navigation = true;
        }).catch(() => {});


        await locator.click({ force: true });
        result.clicked = true;


        await Promise.race([
            navPromise,                 // nếu có redirect
            page.waitForTimeout(1500), // nếu là fetch / DOM
        ]);

    } catch (err) {
        result.error = err.message;
    }


    page.off('request', requestHandler);


    result.requests = requests;

    return result;
}