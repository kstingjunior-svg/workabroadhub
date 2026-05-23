"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupVite = setupVite;
const vite_1 = require("vite");
const vite_config_1 = __importDefault(require("../vite.config"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const nanoid_1 = require("nanoid");
const url_1 = require("url");
const __filename = (0, url_1.fileURLToPath)(import.meta.url);
const __dirname = path_1.default.dirname(__filename);
const viteLogger = (0, vite_1.createLogger)();
async function setupVite(server, app) {
    const serverOptions = {
        middlewareMode: true,
        hmr: { server, path: "/vite-hmr" },
        allowedHosts: true,
    };
    const vite = await (0, vite_1.createServer)({
        ...vite_config_1.default,
        configFile: false,
        customLogger: {
            ...viteLogger,
            error: (msg, options) => {
                viteLogger.error(msg, options);
                process.exit(1);
            },
        },
        server: serverOptions,
        appType: "custom",
    });
    app.use(vite.middlewares);
    app.use("*", async (req, res, next) => {
        const url = req.originalUrl;
        try {
            const clientTemplate = path_1.default.resolve(__dirname, "..", "client", "index.html");
            // always reload the index.html file from disk incase it changes
            let template = await fs_1.default.promises.readFile(clientTemplate, "utf-8");
            template = template.replace(`src="/src/main.tsx"`, `src="/src/main.tsx?v=${(0, nanoid_1.nanoid)()}"`);
            const page = await vite.transformIndexHtml(url, template);
            res.status(200).set({
                "Content-Type": "text/html",
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
            }).end(page);
        }
        catch (e) {
            vite.ssrFixStacktrace(e);
            next(e);
        }
    });
}
