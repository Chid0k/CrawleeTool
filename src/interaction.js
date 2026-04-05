import { Parser } from 'htmlparser2';

class HTMLInteractionExtractor {
    constructor(htmlSource) {
        this.htmlSource = htmlSource;
        this.result = {
            links: [],
            forms: [],
            buttons: [],
            dropBoxes: []
        };
        
        this.currentForm = null;
        this.formStack = [];
        this.tagStack = [];
    }

    extractLinkFromOnclick(onclick) {
        if (!onclick) return null;
        
        const patterns = [
            /(?:window\.)?location\.href\s*=\s*['"]([^'"]+)['"]/,
            /(?:window\.)?location\s*=\s*['"]([^'"]+)['"]/,
            /(?:window\.)?open\s*\(\s*['"]([^'"]+)['"]/,
            /href:\s*['"]([^'"]+)['"]/
        ];
        
        for (const pattern of patterns) {
            const match = onclick.match(pattern);
            if (match) return match[1];
        }
        return null;
    }

    extract() {
        const parser = new Parser({
            onopentag: (name, attributes) => {
                this.tagStack.push({ name, attributes });
                
                if (name === 'a' && attributes.href) {
                    this.result.links.push({
                        href: attributes.href,
                        text: '',
                        type: 'anchor',
                        tag: 'a',
                        attributes: { ...attributes }
                    });
                }
                
                if (name !== 'a' && (attributes['data-href'] || attributes['data-url'] || attributes['data-link'])) {
                    const href = attributes['data-href'] || attributes['data-url'] || attributes['data-link'];
                    this.result.links.push({
                        href: href,
                        text: '',
                        type: 'data-attribute',
                        tag: name,
                        attributes: { ...attributes }
                    });
                }
                
                if (attributes.onclick) {
                    const extractedLink = this.extractLinkFromOnclick(attributes.onclick);
                    if (extractedLink) {
                        this.result.links.push({
                            href: extractedLink,
                            text: '',
                            type: 'onclick',
                            tag: name,
                            attributes: { ...attributes }
                        });
                    }
                }
                
                if (name === 'img' && attributes.src) {
                    this.result.links.push({
                        href: attributes.src,
                        text: attributes.alt || '',
                        type: 'image',
                        tag: 'img',
                        attributes: { ...attributes }
                    });
                }
                
                if (name === 'link' && attributes.href) {
                    this.result.links.push({
                        href: attributes.href,
                        text: '',
                        type: 'stylesheet',
                        tag: 'link',
                        rel: attributes.rel || '',
                        attributes: { ...attributes }
                    });
                }
                
                if (name === 'script' && attributes.src) {
                    this.result.links.push({
                        href: attributes.src,
                        text: '',
                        type: 'script',
                        tag: 'script',
                        attributes: { ...attributes }
                    });
                }
                
                if (name === 'iframe' && attributes.src) {
                    this.result.links.push({
                        href: attributes.src,
                        text: '',
                        type: 'iframe',
                        tag: 'iframe',
                        attributes: { ...attributes }
                    });
                }
                
                else if (name === 'form') {
                    this.currentForm = {
                        action: attributes.action || '',
                        method: attributes.method || 'get',
                        attributes: { ...attributes },
                        inputs: [],
                        buttons: []
                    };
                    this.formStack.push(this.currentForm);
                }
                
                else if (name === 'input') {
                    const inputType = (attributes.type || 'text').toLowerCase();
                    const isButton = ['submit', 'button', 'reset', 'image'].includes(inputType);
                    
                    if (isButton) {
                        const button = {
                            type: inputType,
                            name: attributes.name || '',
                            value: attributes.value || '',
                            text: inputType === 'image' ? (attributes.alt || '') : (attributes.value || ''),
                            attributes: { ...attributes }
                        };
                        
                        if (inputType === 'image' && attributes.src) {
                            button.src = attributes.src;
                        }
                        
                        if (this.currentForm) {
                            this.currentForm.buttons.push(button);
                        } else {
                            this.result.buttons.push(button);
                        }
                    } else {
                        const input = {
                            type: inputType,
                            name: attributes.name || '',
                            value: attributes.value || '',
                            attributes: { ...attributes }
                        };
                        
                        if (this.currentForm) {
                            this.currentForm.inputs.push(input);
                        }
                    }
                }
                
                else if (name === 'textarea') {
                    const input = {
                        type: 'textarea',
                        name: attributes.name || '',
                        value: attributes.value || '',
                        attributes: { ...attributes }
                    };
                    
                    if (this.currentForm) {
                        this.currentForm.inputs.push(input);
                    }
                }
                
                else if (name === 'button') {
                    const button = {
                        type: attributes.type || 'button',
                        name: attributes.name || '',
                        value: attributes.value || '',
                        text: '',
                        attributes: { ...attributes }
                    };
                    
                    if (this.currentForm) {
                        this.currentForm.buttons.push(button);
                    } else {
                        this.result.buttons.push(button);
                    }
                }
                
                else if (name === 'select') {
                    const dropBox = {
                        name: attributes.name || '',
                        attributes: { ...attributes },
                        options: []
                    };
                    
                    this.result.dropBoxes.push(dropBox);
                }
                
                else if (name === 'option') {
                    if (this.result.dropBoxes.length > 0) {
                        const currentDropBox = this.result.dropBoxes[this.result.dropBoxes.length - 1];
                        if (!currentDropBox.closed) {
                            currentDropBox.options.push({
                                value: attributes.value || '',
                                text: '',
                                selected: attributes.hasOwnProperty('selected'),
                                attributes: { ...attributes }
                            });
                        }
                    }
                }
            },
            
            ontext: (text) => {
                if (this.tagStack.length === 0) return;
                
                const currentTag = this.tagStack[this.tagStack.length - 1];
                const trimmedText = text.trim();
                
                if (!trimmedText) return;
                
                if (currentTag.name === 'a' || currentTag.attributes['data-href'] || currentTag.attributes['data-url'] || currentTag.attributes['data-link']) {
                    for (let i = this.result.links.length - 1; i >= 0; i--) {
                        const link = this.result.links[i];
                        if (link.tag === currentTag.name && !link.textSet) {
                            link.text += trimmedText;
                            break;
                        }
                    }
                }
                
                else if (currentTag.name === 'button') {
                    if (this.currentForm && this.currentForm.buttons.length > 0) {
                        const lastButton = this.currentForm.buttons[this.currentForm.buttons.length - 1];
                        lastButton.text += trimmedText;
                    } else if (this.result.buttons.length > 0) {
                        const lastButton = this.result.buttons[this.result.buttons.length - 1];
                        lastButton.text += trimmedText;
                    }
                }
                
                else if (currentTag.name === 'option') {
                    if (this.result.dropBoxes.length > 0) {
                        const currentDropBox = this.result.dropBoxes[this.result.dropBoxes.length - 1];
                        if (!currentDropBox.closed && currentDropBox.options.length > 0) {
                            const lastOption = currentDropBox.options[currentDropBox.options.length - 1];
                            lastOption.text += trimmedText;
                        }
                    }
                }
            },
            
            onclosetag: (name) => {
                if (this.tagStack.length > 0) {
                    const lastTag = this.tagStack[this.tagStack.length - 1];
                    if (lastTag.name === name) {
                        this.tagStack.pop();
                    }
                }
                
                if (name === 'form' && this.formStack.length > 0) {
                    const completedForm = this.formStack.pop();
                    this.result.forms.push(completedForm);
                    this.currentForm = this.formStack.length > 0 ? this.formStack[this.formStack.length - 1] : null;
                }
                
                else if (name === 'select' && this.result.dropBoxes.length > 0) {
                    const currentDropBox = this.result.dropBoxes[this.result.dropBoxes.length - 1];
                    currentDropBox.closed = true;
                }
            }
        });
        
        parser.write(this.htmlSource);
        parser.end();
        
        return this.result;
    }
}

export default HTMLInteractionExtractor;
