"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openai = void 0;
exports.generateImageBuffer = generateImageBuffer;
exports.editImages = editImages;
// @ts-nocheck
const node_fs_1 = __importDefault(require("node:fs"));
const openai_1 = require("openai");
const node_buffer_1 = require("node:buffer");
var openai_2 = require("../../lib/openai");
Object.defineProperty(exports, "openai", { enumerable: true, get: function () { return openai_2.openai; } });
/**
 * Generate an image and return as Buffer.
 * Uses gpt-image-1 model via Replit AI Integrations.
 */
async function generateImageBuffer(prompt, size = "1024x1024") {
    const response = await openai.images.generate({
        model: "gpt-image-1",
        prompt,
        size,
    });
    const base64 = response.data?.[0]?.b64_json ?? "";
    return node_buffer_1.Buffer.from(base64, "base64");
}
/**
 * Edit/combine multiple images into a composite.
 * Uses gpt-image-1 model via Replit AI Integrations.
 */
async function editImages(imageFiles, prompt, outputPath) {
    const images = await Promise.all(imageFiles.map((file) => (0, openai_1.toFile)(node_fs_1.default.createReadStream(file), file, {
        type: "image/png",
    })));
    const response = await openai.images.edit({
        model: "gpt-image-1",
        image: images,
        prompt,
    });
    const imageBase64 = response.data?.[0]?.b64_json ?? "";
    const imageBytes = node_buffer_1.Buffer.from(imageBase64, "base64");
    if (outputPath) {
        node_fs_1.default.writeFileSync(outputPath, imageBytes);
    }
    return imageBytes;
}
