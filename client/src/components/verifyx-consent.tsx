/** Upload consent for VerifyX checks (Kenya Data Protection Act: informed, specific consent). */
export function VerifyXConsent({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 p-3 text-[11px] leading-relaxed text-gray-700 dark:text-gray-300 cursor-pointer">
      <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid="checkbox-verifyx-consent" />
      <span>
        I agree that WorkAbroadHub may process this document to run the check. The document, or the text we extract
        from it, is sent to our document-reading provider (OpenAI) to read the details. We do not keep the original
        file. The details we read and the report are kept for 30 days so you can correct or dispute them,
        then deleted. WorkAbroadHub does not use your documents to train AI models.
      </span>
    </label>
  );
}
