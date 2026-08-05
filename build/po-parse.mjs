/**
 * Minimal .po reader, shared by the build steps.
 *
 * Handles msgid, msgid_plural, msgstr, indexed msgstr[n] and continuation
 * lines. Anything it does not understand is skipped rather than guessed at: a
 * mistranslated catalogue is worse than an untranslated one.
 */

const unquote = (line) => {
    const match = /"((?:[^"\\]|\\.)*)"/.exec(line);
    if (match === null)
        return "";
    return match[1]
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
};

export const parsePo = (text) => {
    const entries = {};
    let header = "";
    let current = null;
    let target = null;

    const flush = () => {
        if (current === null)
            return;
        if (current.id === "")
            header = current.strings[0] ?? "";
        else if (current.strings.some((s) => s !== ""))
            entries[current.id] = current.plural ? current.strings : current.strings[0];
        current = null;
    };

    for (const raw of text.split("\n")) {
        const line = raw.trim();

        if (line === "") {
            flush();
            continue;
        }
        if (line.startsWith("#"))
            continue;

        if (line.startsWith("msgid_plural")) {
            if (current !== null)
                current.plural = true;
            target = "skip";
        } else if (line.startsWith("msgid")) {
            flush();
            current = { id: unquote(line), plural: false, strings: [] };
            target = "id";
        } else if (line.startsWith("msgstr")) {
            if (current !== null)
                current.strings.push(unquote(line));
            target = "str";
        } else if (line.startsWith('"') && current !== null) {
            const piece = unquote(line);
            if (target === "id")
                current.id += piece;
            else if (target === "str" && current.strings.length > 0)
                current.strings[current.strings.length - 1] += piece;
        }
    }
    flush();

    return { header, entries };
};

/**
 * The catalogue's own plural rule, as a JavaScript function body.
 *
 * Taken from the Plural-Forms header rather than assumed, because a language
 * with one form and one with three cannot share a rule.
 */
export const pluralExpression = (header) => {
    const match = /Plural-Forms:[^\n]*plural\s*=\s*([^;\n]+)/i.exec(header);
    if (match === null)
        return "function (n) { return n === 1 ? 0 : 1; }";
    // The header uses C syntax, where a comparison yields 0 or 1.
    return `function (n) { return Number(${match[1].trim()}); }`;
};
