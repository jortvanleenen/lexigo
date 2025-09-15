const DEFAULT_HISTORY_SETTING = {enabled: true};

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const {word, lang} = request || {};
    const term = (word || "").trim();
    if (!term) {
        sendResponse({content: null});
        return true;
    }

    const langNorm = (lang || "en").toLowerCase();

    const primary = () => {
        if (!langNorm.startsWith("en")) return Promise.resolve(null);
        const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`;
        return fetch(url)
            .then(r => r.ok ? r.json() : Promise.resolve(null))
            .then(json => {
                if (!Array.isArray(json) || !json.length) return null;
                const entry = json[0] || {};
                const firstMeaning = entry.meanings?.[0];
                const def = firstMeaning?.definitions?.[0]?.definition || "";
                if (!def) return null;

                const phon = (entry.phonetics || []).find(p => p.audio || p.text) || {};
                const audioSrc = phon.audio || null;

                return {
                    word: (entry.word || term),
                    meaning: def.charAt(0).toUpperCase() + def.slice(1),
                    audioSrc
                };
            })
            .catch(() => null);
    };

    const fallback = () => {
        console.log("Falling back to DDG lookup");
        const url = `https://noai.duckduckgo.com/?t=h_&q=define+${encodeURIComponent(term)}&ia=web`;
        return fetch(url)
            .then(r => r.text())
            .then(html => {
                const doc = new DOMParser().parseFromString(html, "text/html");
                const module = doc.querySelector(".module.ia-module--definitions");
                if (!module) return null;

                const title = module.querySelector(".module__title");
                const wordText = title ? title.childNodes[0].textContent.trim() : term;

                const defEl = module.querySelector(".module--definitions__definition");
                const def = defEl ? defEl.textContent.trim() : "";
                if (!def) return null;

                return {
                    word: wordText,
                    meaning: def.charAt(0).toUpperCase() + def.slice(1),
                    audioSrc: null
                };
            })
            .catch(() => null);
    };

    primary()
        .then(content => content ? content : fallback())
        .then(content => {
            sendResponse({content: content || null});

            if (content) {
                browser.storage.local.get().then(results => {
                    const history = results.history || DEFAULT_HISTORY_SETTING;
                    if (history.enabled) saveWord(content);
                });
            }
        })
        .catch(() => sendResponse({content: null}));

    return true;
});

function saveWord(content) {
    const word = content.word;
    const meaning = content.meaning;

    browser.storage.local.get('definitions').then(results => {
        const definitions = results.definitions || {};
        definitions[word] = meaning;
        browser.storage.local.set({definitions});
    });
}
