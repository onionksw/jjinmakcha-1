import React, { useState, useEffect, useRef } from 'react';
import { MapPin, X, Search } from 'lucide-react';
import { searchPoiSuggestions, setCachedCoordinates, PoiSuggestion } from '../services/tmapService';

interface Props {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    focusBorderClass?: string;
    label?: string;
}

export default function PlaceSearchInput({
    value,
    onChange,
    placeholder = '장소, 건물명, 주소 검색',
    focusBorderClass = 'focus:border-brandBlue',
    label,
}: Props) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState<PoiSuggestion[]>([]);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>();

    // 모달 열릴 때 인풋 포커스
    useEffect(() => {
        if (open) {
            setQuery('');
            setSuggestions([]);
            setTimeout(() => inputRef.current?.focus(), 80);
        }
    }, [open]);

    // 검색 디바운스
    useEffect(() => {
        clearTimeout(debounceRef.current);
        if (query.length < 2) { setSuggestions([]); return; }
        debounceRef.current = setTimeout(async () => {
            setLoading(true);
            const results = await searchPoiSuggestions(query);
            setSuggestions(results);
            setLoading(false);
        }, 300);
        return () => clearTimeout(debounceRef.current);
    }, [query]);

    const handleSelect = (poi: PoiSuggestion) => {
        onChange(poi.name);
        setCachedCoordinates(poi.name, { lat: poi.lat, lon: poi.lon });
        setOpen(false);
    };

    const handleClose = () => {
        setOpen(false);
        setSuggestions([]);
    };

    return (
        <>
            {/* 트리거 — 현재 값 또는 플레이스홀더 표시 */}
            <button
                type="button"
                onClick={() => setOpen(true)}
                className={`w-full text-left bg-gray-50 border-2 border-transparent ${focusBorderClass} rounded-2xl px-5 py-4 transition-all flex items-center gap-3`}
            >
                <Search size={18} className="text-gray-400 shrink-0" />
                <span className={`font-medium truncate ${value ? 'text-gray-800' : 'text-gray-400'}`}>
                    {value || placeholder}
                </span>
            </button>

            {/* 검색 모달 */}
            {open && (
                <div className="fixed inset-0 z-[80] flex flex-col bg-white">
                    {/* 헤더 */}
                    <div className="flex items-center gap-3 px-4 pt-5 pb-3 border-b border-gray-100">
                        <button onClick={handleClose} className="p-2 -ml-1 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100">
                            <X size={22} />
                        </button>
                        <div className="flex-1 relative">
                            <input
                                ref={inputRef}
                                type="text"
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                placeholder={placeholder}
                                className="w-full bg-gray-100 rounded-2xl px-4 py-3 pr-10 text-gray-800 focus:outline-none font-medium placeholder:text-gray-400"
                            />
                            {loading ? (
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-gray-300 border-t-brandBlue rounded-full animate-spin" />
                            ) : query ? (
                                <button
                                    onMouseDown={() => { setQuery(''); setSuggestions([]); }}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                    <X size={16} />
                                </button>
                            ) : null}
                        </div>
                    </div>

                    {/* 결과 목록 */}
                    <div className="flex-1 overflow-y-auto">
                        {suggestions.length > 0 ? (
                            <ul>
                                {suggestions.map((poi, i) => (
                                    <li
                                        key={i}
                                        onClick={() => handleSelect(poi)}
                                        className="flex items-start gap-4 px-5 py-4 border-b border-gray-50 active:bg-blue-50 cursor-pointer"
                                    >
                                        <div className="mt-0.5 w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                                            <MapPin size={15} className="text-brandBlue" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-gray-800">{poi.name}</p>
                                            {poi.address && <p className="text-xs text-gray-400 mt-0.5">{poi.address}</p>}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : query.length >= 2 && !loading ? (
                            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                                <Search size={36} className="mb-3 opacity-30" />
                                <p className="text-sm font-bold">검색 결과가 없어요</p>
                                <p className="text-xs mt-1">다른 키워드로 검색해보세요</p>
                            </div>
                        ) : query.length < 2 ? (
                            <div className="flex flex-col items-center justify-center h-48 text-gray-300">
                                <MapPin size={36} className="mb-3 opacity-40" />
                                <p className="text-sm font-bold text-gray-400">상호명, 건물명, 주소로 검색</p>
                                <p className="text-xs mt-1 text-gray-300">예) 홍대 롤링홀, 강남역, 서울시청</p>
                            </div>
                        ) : null}
                    </div>
                </div>
            )}
        </>
    );
}
