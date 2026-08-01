/**
 * PhoneInput — country picker + national number field with live validation.
 *
 * 2026-07 (Tony's founder brief): every African citizen must be able to
 * register. This is the reusable input surface for signup, profile edit,
 * verification flows, everywhere a phone is captured.
 *
 * UX contract:
 *   - Country picker shows 🇰🇪 Kenya (+254) — flag + name + dial code.
 *   - Search box inside the dropdown so users can type "nig" → Nigeria.
 *   - National number field auto-strips the trunk zero and rejects non-digits.
 *   - Live validation shows a friendly per-country error under the field.
 *   - Emits `{ e164: "+254712345678", country: <AfricanCountry> }` via onChange.
 *   - Default country auto-detected from browser locale, falls back to Kenya.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronDown, Search, Check } from "lucide-react";
import {
  AFRICAN_COUNTRIES,
  defaultCountry,
  findCountryByIso,
  toE164,
  validateNationalNumber,
  type AfricanCountry,
} from "@shared/african-countries";

export interface PhoneInputValue {
  /** E.164 formatted string, e.g. "+254712345678". Empty when invalid. */
  e164: string;
  /** Currently selected country. */
  country: AfricanCountry;
  /** Raw national number as the user typed it (digits only). */
  national: string;
  /** True when the national number passes the country's validation rules. */
  valid: boolean;
  /** Present when `valid === false`. */
  error?: string;
}

interface PhoneInputProps {
  /** Callback fires on every change so parent can enable/disable submit. */
  onChange: (value: PhoneInputValue) => void;
  /** Initial ISO country (overrides browser detection). */
  defaultIso?: string;
  /** Initial national number. */
  defaultNational?: string;
  /** Label above the field. */
  label?: string;
  /** Required marker. */
  required?: boolean;
  /** Disable when a request is in-flight. */
  disabled?: boolean;
  /** For form autofill. */
  name?: string;
  /** Test ID prefix. */
  testId?: string;
}

export function PhoneInput({
  onChange,
  defaultIso,
  defaultNational = "",
  label = "Mobile number",
  required = false,
  disabled = false,
  name = "phone",
  testId = "phone-input",
}: PhoneInputProps) {
  // Pick default country — explicit prop → browser locale → Kenya
  const [country, setCountry] = useState<AfricanCountry>(() =>
    defaultCountry({
      iso: defaultIso,
      languageTag: typeof navigator !== "undefined" ? navigator.language : undefined,
    }),
  );
  const [national, setNational] = useState<string>(defaultNational.replace(/\D/g, ""));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Emit onChange every time the value or country changes
  useEffect(() => {
    const validation = validateNationalNumber(country, national);
    onChange({
      country,
      national,
      e164: validation.valid ? toE164(country, national) : "",
      valid: validation.valid,
      error: validation.reason,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, national]);

  // Filtered country list based on search
  const filteredCountries = useMemo(() => {
    if (!search.trim()) return AFRICAN_COUNTRIES;
    const needle = search.toLowerCase();
    return AFRICAN_COUNTRIES.filter((c) =>
      c.name.toLowerCase().includes(needle) ||
      c.iso.toLowerCase().includes(needle) ||
      c.dialCode.includes(needle),
    );
  }, [search]);

  const validation = validateNationalNumber(country, national);

  function handleCountrySelect(iso: string) {
    const next = findCountryByIso(iso);
    if (!next) return;
    setCountry(next);
    setPickerOpen(false);
    setSearch("");
    // Focus back into the national field so users can immediately type
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleNationalChange(v: string) {
    // Only allow digits; strip leading zeros silently (trunk prefix handling)
    const digits = v.replace(/\D/g, "");
    setNational(digits);
  }

  const showError = national.length >= 3 && !validation.valid;

  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-gray-900 dark:text-gray-100">
          {label}{" "}
          {required && <span className="text-red-500">*</span>}
        </label>
      )}

      <div className="flex gap-2">
        {/* Country selector */}
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              className="h-10 px-3 gap-2 flex-shrink-0"
              data-testid={`${testId}-country-picker`}
            >
              <span className="text-lg">{country.flag}</span>
              <span className="font-mono text-sm">+{country.dialCode}</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="bottom"
            avoidCollisions
            collisionPadding={12}
            className="w-72 p-0 max-h-[70vh] overflow-hidden flex flex-col"
          >
            <div className="p-2 border-b border-gray-200 dark:border-gray-800">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  autoFocus
                  placeholder="Search country…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-7 h-8 text-sm"
                  data-testid={`${testId}-country-search`}
                />
              </div>
            </div>
            {/* overscroll-contain stops the touch scroll here from
                dragging the parent modal on mobile Safari + Chrome. */}
            <div className="flex-1 overflow-y-auto overscroll-contain py-1" style={{ WebkitOverflowScrolling: "touch" }}>
              {filteredCountries.length === 0 && (
                <p className="px-3 py-4 text-xs text-center text-muted-foreground">
                  No African country matches "{search}".
                </p>
              )}
              {filteredCountries.map((c) => (
                <button
                  key={c.iso}
                  type="button"
                  onClick={() => handleCountrySelect(c.iso)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition ${
                    c.iso === country.iso ? "bg-teal-50 dark:bg-teal-950/30" : ""
                  }`}
                  data-testid={`${testId}-country-${c.iso}`}
                >
                  <span className="text-lg">{c.flag}</span>
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">+{c.dialCode}</span>
                  {c.iso === country.iso && <Check className="h-3.5 w-3.5 text-teal-600" />}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* National number */}
        <Input
          ref={inputRef}
          type="tel"
          inputMode="tel"
          name={name}
          value={national}
          onChange={(e) => handleNationalChange(e.target.value)}
          disabled={disabled}
          placeholder={
            country.iso === "KE" ? "712345678" :
            country.iso === "NG" ? "8012345678" :
            country.iso === "ZA" ? "821234567" :
            country.iso === "GH" ? "241234567" :
            `${country.minNationalLen}-digit mobile number`
          }
          autoComplete="tel-national"
          className={`flex-1 h-10 ${showError ? "border-red-500 focus-visible:ring-red-500" : ""}`}
          data-testid={`${testId}-national`}
          aria-invalid={showError}
          aria-describedby={showError ? `${testId}-error` : undefined}
        />
      </div>

      {/* Live validation error */}
      {showError && (
        <p id={`${testId}-error`} className="text-xs text-red-500" data-testid={`${testId}-error`}>
          {validation.reason}
        </p>
      )}

      {/* Helper text when valid */}
      {!showError && national.length >= 3 && validation.valid && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
          ✓ {toE164(country, national)}
        </p>
      )}

      {/* Guidance for empty state */}
      {national.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          Enter your mobile number — no leading 0, no spaces. Just the digits after your country code.
        </p>
      )}
    </div>
  );
}
