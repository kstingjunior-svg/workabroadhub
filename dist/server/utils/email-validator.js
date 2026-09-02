"use strict";
/**
 * Email real-identity validation
 *
 * Three checks, in order of cheapness:
 *   1. Syntactic validity (regex)
 *   2. Disposable / throwaway provider blocklist
 *   3. MX record lookup (does the domain actually accept mail?)
 *
 * Returns a structured result so callers can give the user a specific reason.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.__testing__ = void 0;
exports.validateEmail = validateEmail;
const dns_1 = require("dns");
const SYNTACTIC_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Common test patterns we reject outright. Real users do not type these.
const OBVIOUS_FAKE_PATTERNS = [
    /^test@test\./i,
    /^example@example\./i,
    /^admin@example\./i,
    /^user@user\./i,
    /^(asdf|qwerty|qwe|abc|xyz|fake|test\d*|user\d*)@/i,
    /^.+@(example|test|invalid|localhost)\.(com|org|net)$/i,
];
// Maintained list of disposable / throwaway / temporary email providers.
// Sourced from https://github.com/disposable-email-domains/disposable-email-domains
// (snapshotted — extend over time as new providers appear).
// We intentionally keep this list inline rather than as an external JSON file
// so it ships with the bundle and works offline.
const DISPOSABLE_DOMAINS = new Set([
    "0-mail.com", "027168.com", "10mail.org", "10minutemail.co.za",
    "10minutemail.com", "10minutemail.net", "10minutesmail.com", "1secmail.com",
    "1secmail.net", "1secmail.org", "20mail.it", "20minutemail.com",
    "2prong.com", "30minutemail.com", "3d-painting.com", "4warding.com",
    "5ymail.com", "60minutemail.com", "anonbox.net", "anonymbox.com",
    "antichef.net", "armyspy.com", "asdasd.ru", "binkmail.com",
    "bobmail.info", "brefmail.com", "bsnow.net", "bspamfree.org",
    "bugmenot.com", "burnermail.io", "cs.email", "cuvox.de",
    "deadaddress.com", "dharmatel.net", "discard.email", "discardmail.com",
    "discardmail.de", "dispostable.com", "dodgeit.com", "dodgit.com",
    "dontreg.com", "dontsendmespam.de", "dropmail.me", "duck2.club",
    "dump-email.info", "dumpyemail.com", "e4ward.com", "easytrashmail.com",
    "edu.sg", "einrot.com", "email-temp.com", "emailfake.com",
    "emailmiser.com", "emailondeck.com", "emailsensei.com", "emailtemporanea.net",
    "emailtemporario.com.br", "emailthe.net", "emailtmp.com", "emailto.de",
    "emailwarden.com", "ephemail.net", "explodemail.com", "fake-box.com",
    "fakeinbox.com", "fakemail.fr", "fakemailgenerator.com", "fansworldwide.de",
    "fastacura.com", "fdfdsfds.com", "filzmail.com", "first-email.net",
    "fivemail.de", "fleckens.hu", "fly-ts.de", "freecharas.com",
    "freemails.cf", "freemails.ga", "freemails.ml", "fudgerub.com",
    "garliclife.com", "gawab.com", "getairmail.com", "getmails.eu",
    "ghosttexter.de", "givmail.com", "gowikibooks.com", "gowikicampus.com",
    "grandmamail.com", "grr.la", "guerillamail.biz", "guerillamail.com",
    "guerillamail.de", "guerillamail.info", "guerillamail.net", "guerillamail.org",
    "guerrillamail.biz", "guerrillamail.com", "guerrillamail.de", "guerrillamail.info",
    "guerrillamail.net", "guerrillamail.org", "guerrillamailblock.com", "harakirimail.com",
    "haribu.com", "hochsitze.com", "hopemail.biz", "hotpop.com",
    "hulapla.de", "imails.info", "inboxalias.com", "inboxbear.com",
    "inboxstore.me", "incognitomail.com", "incognitomail.net", "incognitomail.org",
    "infocom.zp.ua", "instant-mail.de", "interburp.com", "ip6.li",
    "irish2me.com", "iwi.net", "junk1e.com", "kasmail.com",
    "keepmymail.com", "killmail.com", "kiwitalk.com", "klassmaster.com",
    "klzlk.com", "kook.ml", "kulturbetrieb.info", "letthemeatspam.com",
    "lhsdv.com", "lol.ovpn.to", "lookugly.com", "lopl.co.cc",
    "lortemail.dk", "lr78.com", "lroid.com", "lukop.dk",
    "m4ilweb.info", "maboard.com", "mail-filter.com", "mail-temp.com",
    "mail-temporaire.fr", "mail.by", "mail.mezimages.net", "mail.zp.ua",
    "mail114.net", "mail1a.de", "mail21.cc", "mail2rss.org",
    "mail333.com", "mail4trash.com", "mailbidon.com", "mailbiz.biz",
    "mailblocks.com", "mailbucket.org", "mailcat.biz", "mailcatch.com",
    "maildrop.cc", "mailed.ro", "maileimer.de", "mailexpire.com",
    "mailfa.tk", "mailforspam.com", "mailfree.org", "mailfreeonline.com",
    "mailguard.me", "mailimate.com", "mailin8r.com", "mailinator.com",
    "mailinator.net", "mailinator.org", "mailinator2.com", "mailincubator.com",
    "mailismagic.com", "mailme.lv", "mailmoat.com", "mailms.com",
    "mailnator.com", "mailnesia.com", "mailnull.com", "mailorg.org",
    "mailpick.biz", "mailrock.biz", "mailsac.com", "mailshell.com",
    "mailsiphon.com", "mailslapping.com", "mailtemp.info", "mailtothis.com",
    "mailtrash.net", "mailtv.net", "mailtv.tv", "mailzilla.com",
    "mailzilla.org", "makemetheking.com", "manybrain.com", "mbx.cc",
    "mega.zik.dj", "meinspamschutz.de", "meltmail.com", "mintemail.com",
    "moburl.com", "moncourrier.fr.nf", "monemail.fr.nf", "monmail.fr.nf",
    "msa.minsmail.com", "mt2009.com", "mx0.wwwnew.eu", "mycard.net.ua",
    "mycleaninbox.net", "mymail-in.net", "mypartyclip.de", "myphantomemail.com",
    "myspaceinc.com", "myspaceinc.net", "myspaceinc.org", "myspacepimpedup.com",
    "neomailbox.com", "nepwk.com", "nervmich.net", "nervtmich.net",
    "netmails.com", "netmails.net", "neverbox.com", "nice-4u.com",
    "nincsmail.hu", "no-spam.ws", "noblepioneer.com", "nomail.pw",
    "nomail.xl.cx", "nomail2me.com", "noref.in", "nospam.ze.tc",
    "nospam4.us", "nospamfor.us", "nospamthanks.info", "nowmymail.com",
    "objectmail.com", "obobbo.com", "onewaymail.com", "online.ms",
    "oopi.org", "ourklips.com", "outlawspam.com", "ovpn.to",
    "owlpic.com", "pancakemail.com", "pickupman.com", "pjjkp.com",
    "plexolan.de", "poczta.onet.pl", "politikerclub.de", "poofy.org",
    "pookmail.com", "privacy.net", "proxymail.eu", "prtnx.com",
    "putthisinyourspamdatabase.com", "qq.com", "quickinbox.com", "rcpt.at",
    "reallymymail.com", "recode.me", "recursor.net", "regbypass.com",
    "regbypass.comsafe-mail.net", "rejectmail.com", "rmqkr.net", "royal.net",
    "rppkn.com", "rtrtr.com", "s0ny.net", "safe-mail.net",
    "safersignup.de", "safetymail.info", "safetypost.de", "sandelf.de",
    "saynotospams.com", "schafmail.de", "schrott-email.de", "selfdestructingmail.com",
    "sendspamhere.com", "sharklasers.com", "shieldemail.com", "shiftmail.com",
    "shitmail.me", "shortmail.net", "sibmail.com", "skeefmail.com",
    "slaskpost.se", "smashmail.de", "smellfear.com", "snakemail.com",
    "sneakemail.com", "snkmail.com", "sofimail.com", "sofort-mail.de",
    "sogetthis.com", "soodonims.com", "spam.la", "spam.su",
    "spam4.me", "spamavert.com", "spambob.com", "spambob.net",
    "spambob.org", "spambog.com", "spambog.de", "spambog.ru",
    "spambox.info", "spambox.us", "spamcero.com", "spamcon.org",
    "spamcorptastic.com", "spamcowboy.com", "spamcowboy.net", "spamcowboy.org",
    "spamday.com", "spamex.com", "spamfree24.com", "spamfree24.de",
    "spamfree24.eu", "spamfree24.info", "spamfree24.net", "spamfree24.org",
    "spamgourmet.com", "spamgourmet.net", "spamgourmet.org", "spamherelots.com",
    "spamhereplease.com", "spamhole.com", "spamify.com", "spaminator.de",
    "spamkill.info", "spaml.com", "spaml.de", "spammotel.com",
    "spamobox.com", "spamoff.de", "spamslicer.com", "spamspot.com",
    "spamthis.co.uk", "spamthisplease.com", "speed.1s.fr", "supergreatmail.com",
    "supermailer.jp", "superrito.com", "suremail.info", "talkinator.com",
    "teleworm.com", "teleworm.us", "temp-mail.com", "temp-mail.org",
    "temp-mail.ru", "tempemail.biz", "tempemail.com", "tempemail.net",
    "tempinbox.co.uk", "tempinbox.com", "tempmail.de", "tempmail.eu",
    "tempmail.it", "tempmailer.com", "tempmailer.de", "tempomail.fr",
    "temporarily.de", "temporarioemail.com.br", "temporaryemail.net", "temporaryforwarding.com",
    "temporaryinbox.com", "thanksnospam.info", "thankyou2010.com", "thisisnotmyrealemail.com",
    "throwawayemailaddresses.com", "tilien.com", "tittbit.in", "tmail.ws",
    "tmailinator.com", "toomail.biz", "topranklist.de", "tradermail.info",
    "trash-amil.com", "trash-mail.at", "trash-mail.com", "trash-mail.de",
    "trash2009.com", "trashdevil.com", "trashemail.de", "trashmail.at",
    "trashmail.com", "trashmail.de", "trashmail.me", "trashmail.net",
    "trashmail.org", "trashmail.ws", "trashymail.com", "trayna.com",
    "trbvm.com", "trialmail.de", "trillianpro.com", "twinmail.de",
    "tyldd.com", "uggsrock.com", "uplipht.com", "venompen.com",
    "veryrealemail.com", "viditag.com", "viewcastmedia.com", "viewcastmedia.net",
    "viewcastmedia.org", "vpn.st", "wegwerf-emails.de", "wegwerfadresse.de",
    "wegwerfemail.com", "wegwerfemail.de", "wegwerfmail.de", "wegwerfmail.info",
    "wegwerfmail.net", "wegwerfmail.org", "whyspam.me", "wilemail.com",
    "willhackforfood.biz", "willselfdestruct.com", "winemaven.info", "wronghead.com",
    "wuzup.net", "wuzupmail.net", "www.e4ward.com", "www.mailinator.com",
    "wwwnew.eu", "xagloo.com", "xmaily.com", "xoxy.net",
    "yapped.net", "yeah.net", "yep.it", "yogamaven.com",
    "yopmail.com", "yopmail.fr", "yopmail.net", "ypmail.webarnak.fr.eu.org",
    "yuurok.com", "zehnminutenmail.de", "zetmail.com", "zippymail.info",
    "zoaxe.com", "zoemail.org",
    // Newer additions seen in WAH abuse logs
    "tempr.email", "mohmal.com", "mintemail.org", "spamgourmet.eu",
    "fakeemail.com", "throwawaymail.com", "instantemail.org", "discard.com",
    "burnermail.com", "anonaddy.me", "33mail.com", "snapmail.cc",
    "tafmail.com", "spamfighter.com", "mailpoof.com", "fakeinbox.cf",
    "minutemail.com", "yopmail.org", "moakt.com", "moakt.cc",
    "trickmail.net", "mail-cat.com",
]);
/** Cache MX lookup results for 24 h to avoid re-checking the same domain on every signup. */
const MX_CACHE = new Map();
const MX_TTL_MS = 24 * 60 * 60 * 1000;
async function validateEmail(rawEmail) {
    const email = (rawEmail || "").trim().toLowerCase();
    // 1) Syntax
    if (!email || !SYNTACTIC_EMAIL_RE.test(email)) {
        return { valid: false, reason: "syntax", message: "Please enter a valid email address." };
    }
    // 2) Obvious-fake / test patterns
    if (OBVIOUS_FAKE_PATTERNS.some((re) => re.test(email))) {
        return {
            valid: false,
            reason: "obvious_fake",
            message: "Please use a real email address — test addresses are not allowed.",
        };
    }
    const domain = email.split("@")[1];
    // 3) Disposable provider blocklist
    if (DISPOSABLE_DOMAINS.has(domain)) {
        return {
            valid: false,
            reason: "disposable",
            message: "Temporary or disposable email addresses are not allowed. Please use your real personal or work email.",
        };
    }
    // 4) MX lookup (cached). If the domain has zero MX records, no one can ever email this user — reject.
    try {
        const now = Date.now();
        const cached = MX_CACHE.get(domain);
        let hasMx;
        if (cached && cached.expiresAt > now) {
            hasMx = cached.hasMx;
        }
        else {
            const records = await dns_1.promises.resolveMx(domain).catch(() => []);
            hasMx = Array.isArray(records) && records.length > 0;
            MX_CACHE.set(domain, { hasMx, expiresAt: now + MX_TTL_MS });
        }
        if (!hasMx) {
            return {
                valid: false,
                reason: "no_mx",
                message: `The domain "${domain}" cannot receive email. Please check the spelling or use a different address.`,
            };
        }
    }
    catch {
        // DNS lookup itself failed (network/transient) — fail open, don't block legitimate users
        // The MX cache will retry on next signup
        console.warn(`[email-validator] MX lookup failed for ${domain} — allowing through`);
    }
    return { valid: true, normalized: email };
}
/** Test helper — exposed for unit tests. */
exports.__testing__ = {
    DISPOSABLE_DOMAINS,
    OBVIOUS_FAKE_PATTERNS,
    clearMxCache: () => MX_CACHE.clear(),
};
