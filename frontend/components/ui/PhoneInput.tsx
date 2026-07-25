"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";

const COUNTRIES = [
  { code: "IN", dial: "+91",  flag: "🇮🇳", name: "India" },
  { code: "US", dial: "+1",   flag: "🇺🇸", name: "United States" },
  { code: "GB", dial: "+44",  flag: "🇬🇧", name: "United Kingdom" },
  { code: "AE", dial: "+971", flag: "🇦🇪", name: "UAE" },
  { code: "AU", dial: "+61",  flag: "🇦🇺", name: "Australia" },
  { code: "CA", dial: "+1",   flag: "🇨🇦", name: "Canada" },
  { code: "SG", dial: "+65",  flag: "🇸🇬", name: "Singapore" },
  { code: "PK", dial: "+92",  flag: "🇵🇰", name: "Pakistan" },
  { code: "BD", dial: "+880", flag: "🇧🇩", name: "Bangladesh" },
  { code: "NP", dial: "+977", flag: "🇳🇵", name: "Nepal" },
  { code: "LK", dial: "+94",  flag: "🇱🇰", name: "Sri Lanka" },
  { code: "GY", dial: "+592", flag: "🇬🇾", name: "Guyana" },
  { code: "TT", dial: "+1",   flag: "🇹🇹", name: "Trinidad & Tobago" },
  { code: "NG", dial: "+234", flag: "🇳🇬", name: "Nigeria" },
  { code: "ZA", dial: "+27",  flag: "🇿🇦", name: "South Africa" },
  { code: "KE", dial: "+254", flag: "🇰🇪", name: "Kenya" },
  { code: "DE", dial: "+49",  flag: "🇩🇪", name: "Germany" },
  { code: "FR", dial: "+33",  flag: "🇫🇷", name: "France" },
  { code: "IT", dial: "+39",  flag: "🇮🇹", name: "Italy" },
  { code: "ES", dial: "+34",  flag: "🇪🇸", name: "Spain" },
  { code: "NL", dial: "+31",  flag: "🇳🇱", name: "Netherlands" },
  { code: "SE", dial: "+46",  flag: "🇸🇪", name: "Sweden" },
  { code: "CH", dial: "+41",  flag: "🇨🇭", name: "Switzerland" },
  { code: "JP", dial: "+81",  flag: "🇯🇵", name: "Japan" },
  { code: "CN", dial: "+86",  flag: "🇨🇳", name: "China" },
  { code: "KR", dial: "+82",  flag: "🇰🇷", name: "South Korea" },
  { code: "ID", dial: "+62",  flag: "🇮🇩", name: "Indonesia" },
  { code: "MY", dial: "+60",  flag: "🇲🇾", name: "Malaysia" },
  { code: "PH", dial: "+63",  flag: "🇵🇭", name: "Philippines" },
  { code: "TH", dial: "+66",  flag: "🇹🇭", name: "Thailand" },
  { code: "VN", dial: "+84",  flag: "🇻🇳", name: "Vietnam" },
  { code: "BR", dial: "+55",  flag: "🇧🇷", name: "Brazil" },
  { code: "MX", dial: "+52",  flag: "🇲🇽", name: "Mexico" },
  { code: "AR", dial: "+54",  flag: "🇦🇷", name: "Argentina" },
  { code: "CO", dial: "+57",  flag: "🇨🇴", name: "Colombia" },
  { code: "EG", dial: "+20",  flag: "🇪🇬", name: "Egypt" },
  { code: "SA", dial: "+966", flag: "🇸🇦", name: "Saudi Arabia" },
  { code: "QA", dial: "+974", flag: "🇶🇦", name: "Qatar" },
  { code: "KW", dial: "+965", flag: "🇰🇼", name: "Kuwait" },
  { code: "BH", dial: "+973", flag: "🇧🇭", name: "Bahrain" },
  { code: "OM", dial: "+968", flag: "🇴🇲", name: "Oman" },
];

function detectCountry(value: string) {
  if (!value) return COUNTRIES[0];
  const v = value.startsWith("+") ? value : "+" + value;
  return COUNTRIES.find((c) => v.startsWith(c.dial)) || COUNTRIES[0];
}

function stripDial(value: string, dial: string) {
  const v = value.startsWith("+") ? value : "+" + value;
  if (v.startsWith(dial)) return v.slice(dial.length).replace(/^\s+/, "");
  return v.replace(/^\+/, "");
}

interface PhoneInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  label?: string;
  hint?: string;
  className?: string;
}

export function PhoneInput({ value, onChange, placeholder = "Mobile number", label, hint, className = "" }: PhoneInputProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(() => detectCountry(value));
  const [localNum, setLocalNum] = useState(() => stripDial(value, detectCountry(value).dial));
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
    else setSearch("");
  }, [open]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function selectCountry(c: typeof COUNTRIES[0]) {
    setSelected(c);
    setOpen(false);
    const full = localNum.trim() ? `${c.dial}${localNum.trim()}` : "";
    onChange(full);
  }

  function handleNumChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^\d\s\-()]/g, "");
    setLocalNum(raw);
    onChange(raw.trim() ? `${selected.dial}${raw.trim()}` : "");
  }

  const filtered = COUNTRIES.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.dial.includes(search) ||
      c.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className={`relative ${className}`} ref={wrapRef}>
      {label && <label className="mb-1 block text-xs text-muted">{label}</label>}

      {/* ── Input row ── */}
      <div className={`flex overflow-hidden rounded-xl border ${open ? "border-accent ring-1 ring-accent/30" : "border-border"} bg-background transition-shadow`}>
        {/* Country trigger */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 border-r border-border bg-background/60 px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5 shrink-0"
        >
          <span className="text-base leading-none">{selected.flag}</span>
          <span className="text-xs text-muted font-medium tabular-nums">{selected.dial}</span>
          <ChevronDown className={`h-3 w-3 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {/* Number input */}
        <input
          type="tel"
          value={localNum}
          onChange={handleNumChange}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted/50"
        />
      </div>

      {hint && <p className="mt-0.5 text-[10px] text-muted">{hint}</p>}

      {/* ── Dropdown — opens BELOW the field ── */}
      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 rounded-xl border border-border bg-card shadow-lg">
          {/* Search box */}
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search country..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted/50"
            />
          </div>

          {/* Country list */}
          <ul className="max-h-52 overflow-y-auto py-1" role="listbox">
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-muted text-center">No countries found</li>
            ) : (
              filtered.map((c) => (
                <li key={c.code}>
                  <button
                    type="button"
                    onClick={() => selectCountry(c)}
                    className={`flex w-full items-center gap-3 px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5 text-left transition-colors ${
                      c.code === selected.code ? "bg-accent/10 font-medium text-accent" : ""
                    }`}
                    role="option"
                    aria-selected={c.code === selected.code}
                  >
                    <span className="text-base leading-none w-5 shrink-0">{c.flag}</span>
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="text-xs text-muted tabular-nums shrink-0">{c.dial}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
