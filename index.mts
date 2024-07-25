import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { relative, dirname, join } from "node:path";
import { cwd } from "node:process";
import { parse } from "csv-parse";

const __filename = fileURLToPath(import.meta.url);
const __directory = relative(dirname(__filename), cwd());

type EntityChars = '"' | "&" | "'" | "<" | ">";

const entityMap = new Map<EntityChars, string>([
  ['"', "&quot;"],
  ["&", "&amp;"],
  ["'", "&apos;"],
  ["<", "&lt;"],
  [">", "&gt;"],
]);

/**
 * Replaces characters in a string so it can be used as an XML
 * attribute value.
 *
 * | Name | Character | Unicode code point (decimal) | Standard | Name                               |
 * | ---- | --------- | ---------------------------- | -------- | ---------------------------------- |
 * | quot | "         | U+0022 (34)                  | XML 1.0  | quotation mark                     |
 * | amp  | &         | U+0026 (38)                  | XML 1.0  | ampersand                          |
 * | apos | '         | U+0027 (39)                  | XML 1.0  | apostrophe (1.0: apostrophe-quote) |
 * | lt   | <         | U+003C (60)                  | XML 1.0  | less-than sign                     |
 * | gt   | >         | U+003E (62)                  | XML 1.0  | greater-than sign                  |
 *
 * @param s A string
 */
function modifyStringsForXml(s: string): string {
  // See https://en.wikipedia.org/wiki/List_of_XML_and_HTML_character_entity_references#List_of_predefined_entities_in_XML
  const re = /["&'<>]/g;
  if (!re.test(s)) {
    return s;
  }
  return s.replaceAll(
    re,
    (subString) => entityMap.get(subString as EntityChars) || subString
  );
}

const subscriptionsPath = join(
  __directory,
  "Takeout",
  "YouTube and YouTube Music",
  "subscriptions",
  "subscriptions.csv"
);

interface SubscriptionRow {
  "Channel Id": string;
  "Channel Url": string;
  "Channel Title": string;
}

class SubscriptionInfo {
  public get feedUrl(): string {
    return `https://www.youtube.com/feeds/videos.xml?channel_id=${this.id}`;
  }

  /**
   * Returns an OPML outline element for the feed item.
   */
  public get opmlOption(): string {
    const title = modifyStringsForXml(this.title);
    return `<outline type="rss" title="${title}" text="${title}" version="RSS" xmlUrl="${this.feedUrl}" htmlUrl="${this.feedUrl}"/>`;
  }

  constructor(
    /** Feed identifier string */
    public readonly id: string,
    /**
     * Feed URL
     * `"http://www.youtube.com/channel/"` + id
     */
    public readonly url: string,
    /** Channel title */
    public readonly title: string
  ) {}
}

const csvContent = await readFile(subscriptionsPath);

const subscriptionInfos = await new Promise<SubscriptionInfo[]>((resolve, reject) => {
  parse(
    csvContent,
    {
      skipEmptyLines: true,
      delimiter: ",",
      columns: true,
    },
    (err, records, info) => {
      if (info) {
        console.info(info);
      }
      if (err) {
        reject(err);
      } else {
        const subscriptionInfos = (records as Array<SubscriptionRow>).map(
          (r) =>
            new SubscriptionInfo(
              r["Channel Id"],
              r["Channel Url"],
              r["Channel Title"]
            )
        );
        resolve(subscriptionInfos);
      }
    }
  );
})


// Create an array of strings that will become the OPML content.
const outputParts = new Array<string>(`<opml version="1.0">
<head>
  <title>YouTube channels</title>
  <dateCreated>${new Date().toUTCString()}</dateCreated>
</head>
<body>`);

let count = 0;
for (const si of subscriptionInfos) {
  count += outputParts.push(si.opmlOption);
}

if (count < 1) {
  console.warn("⚠️ No elements were processed!");
} else {
  console.info(`${count} elements processed.`);
}

outputParts.push("</body></opml>");

const opml = outputParts.join("\n");

const outputFile = "YouTubeChannels.opml";
console.info(`Writing to ${outputFile}...`);
writeFile(outputFile, opml, {
  encoding: "utf8",
});
console.info(`Completed writing to ${outputFile}`);
