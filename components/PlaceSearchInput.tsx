import React, { useState, useEffect, useRef } from 'react';
import { MapPin, X } from 'lucide-react';
import { searchPoiSuggestions, setCachedCoordinates, PoiSuggestion } from '../services/tmapService';

interface Props {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    focusBorderClass?: string;
    rightSlot?: React.ReactNode;
}

export default function PlaceSearchInput({
    value,
    onChange,
    placeholder = '장소, 건물명, 주소 검색',
    focusBorderClass = 'focus:border-brandBlue',
    rightSlot,
}: Props) {
    const [query, setQuery] = useState(value);
    const [suggestions, setSuggestions] = useState<PoiSuggestion[]>([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>();
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => { setQuery(value); }, [value]);

    useEffect(() => {
        clearTimeout(debounceRef.current);
        if (query.length < 2) { setSuggestions([]); setOpen(false); return; }
        debounceRef.current = setTimeout(async () => {
            setLoading(true);
            const results = await searchPoiSuggestions(query);
            setSuggestions(results);
            setOpen(results.length > 0);
            setLoading(false);
        }, 300);
        return () => clearTimeout(debounceRef.current);
    }, [query]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleSelect = (poi: PoiSuggestion) => {
        setQuery(poi.name);
        onChange(poi.name);
        setCachedCoordinates(poi.name, { lat: poi.lat, lon: poi.lon });
        setOpen(false);
        setSuggestions([]);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setQuery(e.target.value);
        onChange(e.target.value);
    };

    const handleClear = () => {
        setQuery('');
        onChange('');
        setSuggestions([]);
        setOpen(false);
    };

    return (
        <div ref={wrapperRef} className="relative flex-1">
            <div className="relative">
                <input
                    type="text"
                    value={query}
                    onChange={handleChange}
                    onFocus={() => suggestions.length > 0 && setOpen(true)}
                    placeholder={placeholder}
                    className={`w-full bg-gray-50 border-2 border-transparent ${focusBorderClass} focus:bg-white rounded-2xl px-5 py-4 text-gray-800 focus:outline-none transition-all placeholder:text-gray-400 font-medium pr-10`}
                />
                {loading ? (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-gray-200 border-t-brandBlue rounded-full animate-spin pointer-events-none" />
                ) : query ? (
                    <button
                        onMouseDown={handleClear}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
                    >
                        <X size={16} />
                    </button>
                ) : null}
            </div>

            {open && suggestions.length > 0 && (
                <ul className="absolute z-50 left-0 right-0 mt-1 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden max-h-60 overflow-y-auto">
                    {suggestions.map((poi, i) => (
                        <li
                            key={i}
                            onMouseDown={() => handleSelect(poi)}
                            className="flex items-start gap-3 px-4 py-3 hover:bg-blue-50 active:bg-blue-100 cursor-pointer border-b border-gray-50 last:border-0"
                        >
                            <MapPin size={14} className="text-brandBlue shrink-0 mt-0.5" />
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-800 truncate">{poi.name}</p>
                                {poi.address && <p className="text-xs text-gray-400 truncate">{poi.address}</p>}
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {rightSlot && <div className="mt-1">{rightSlot}</div>}
        </div>
    );
}
