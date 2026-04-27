import React, { useState, useEffect, useRef } from 'react';
import { MapPin, X, Map, ChevronLeft } from 'lucide-react';
import { searchPoiSuggestions, setCachedCoordinates, PoiSuggestion } from '../services/tmapService';

interface Props {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    focusBorderClass?: string;
    onGps?: () => void;
}

export default function PlaceSearchInput({
    value,
    onChange,
    placeholder = '장소, 건물명, 주소',
    focusBorderClass = 'focus:border-brandBlue',
    onGps,
}: Props) {
    const [query, setQuery] = useState(value || '');
    const [modalOpen, setModalOpen] = useState(false);
    const [results, setResults] = useState<PoiSuggestion[]>([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [mapPoi, setMapPoi] = useState<PoiSuggestion | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { setQuery(value); }, [value]);

    const handleSearch = async () => {
        const q = query.trim();
        if (!q) return;
        setResults([]);
        setSearched(false);
        setModalOpen(true);
        setLoading(true);
        const r = await searchPoiSuggestions(q);
        setResults(r);
        setLoading(false);
        setSearched(true);
    };

    const handleSelect = (poi: PoiSuggestion) => {
        setQuery(poi.name);
        onChange(poi.name);
        setCachedCoordinates(poi.name, { lat: poi.lat, lon: poi.lon });
        setModalOpen(false);
        setMapPoi(null);
    };

    const openMap = (poi: PoiSuggestion, e: React.MouseEvent) => {
        e.stopPropagation();
        setMapPoi(poi);
    };

    const osmSrc = (poi: PoiSuggestion) => {
        const d = 0.004;
        return `https://www.openstreetmap.org/export/embed.html?bbox=${poi.lon - d},${poi.lat - d},${poi.lon + d},${poi.lat + d}&layer=mapnik&marker=${poi.lat},${poi.lon}`;
    };

    return (
        <div className="w-full flex gap-2">
            {/* 텍스트 입력 */}
            <div className="relative flex-1">
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    placeholder={placeholder}
                    className={`w-full bg-gray-50 border-2 border-transparent ${focusBorderClass} focus:bg-white rounded-2xl px-4 py-4 text-gray-800 focus:outline-none transition-all placeholder:text-gray-400 font-medium ${onGps ? 'pr-12' : ''}`}
                />
                {onGps && (
                    <button
                        onClick={onGps}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-brandBlue hover:bg-blue-50 rounded-xl transition-colors"
                        title="현재 위치"
                    >
                        <MapPin size={20} />
                    </button>
                )}
            </div>
            <button
                onClick={handleSearch}
                className="px-4 py-4 bg-brandBlue text-white rounded-2xl font-bold text-sm shrink-0 hover:bg-blue-500 active:scale-95 transition-all"
            >
                검색
            </button>

            {/* ── 검색 결과 모달 ── */}
            {modalOpen && !mapPoi && (
                <div
                    className="fixed inset-0 z-[80] bg-black/50 flex items-end justify-center"
                    onClick={() => setModalOpen(false)}
                >
                    <div
                        className="bg-white w-full max-w-lg rounded-t-3xl overflow-hidden shadow-2xl flex flex-col"
                        style={{ maxHeight: '70vh' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 shrink-0">
                            <p className="font-black text-gray-800 text-base">
                                <span className="text-brandBlue">"{query}"</span> 검색 결과
                            </p>
                            <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="overflow-y-auto flex-1">
                            {loading && (
                                <div className="flex items-center justify-center py-12 gap-3">
                                    <div className="w-5 h-5 border-2 border-gray-200 border-t-brandBlue rounded-full animate-spin" />
                                    <span className="text-gray-400 font-bold text-sm">검색 중...</span>
                                </div>
                            )}
                            {!loading && results.map((poi, i) => (
                                <div
                                    key={i}
                                    onClick={() => handleSelect(poi)}
                                    className="flex items-center gap-3 px-5 py-4 border-b border-gray-50 active:bg-blue-50 cursor-pointer hover:bg-gray-50"
                                >
                                    <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                                        <MapPin size={16} className="text-brandBlue" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-gray-800 truncate">{poi.name}</p>
                                        {poi.address && <p className="text-xs text-gray-400 mt-0.5 truncate">{poi.address}</p>}
                                    </div>
                                    <button
                                        onClick={e => openMap(poi, e)}
                                        className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-green-50 text-green-600 text-xs font-bold shrink-0 hover:bg-green-100 active:scale-95 transition-all"
                                    >
                                        <Map size={12} />
                                        지도
                                    </button>
                                </div>
                            ))}
                            {!loading && searched && results.length === 0 && (
                                <div className="flex flex-col items-center py-12 text-gray-400">
                                    <MapPin size={36} className="mb-3 opacity-30" />
                                    <p className="text-sm font-bold">검색 결과가 없어요</p>
                                    <p className="text-xs mt-1">다른 키워드로 다시 검색해보세요</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── 지도 모달 ── */}
            {mapPoi && (
                <div className="fixed inset-0 z-[90] bg-black/60 flex items-end justify-center">
                    <div
                        className="bg-white w-full max-w-lg rounded-t-3xl overflow-hidden shadow-2xl flex flex-col"
                        style={{ height: '82vh' }}
                    >
                        {/* 지도 헤더 */}
                        <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-gray-100 shrink-0">
                            <button
                                onClick={() => setMapPoi(null)}
                                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400"
                            >
                                <ChevronLeft size={22} />
                            </button>
                            <div className="flex-1 min-w-0">
                                <p className="font-black text-gray-800 truncate">{mapPoi.name}</p>
                                {mapPoi.address && <p className="text-xs text-gray-400 truncate">{mapPoi.address}</p>}
                            </div>
                        </div>

                        {/* 지도 iframe */}
                        <iframe
                            src={osmSrc(mapPoi)}
                            className="w-full flex-1 border-0"
                            title="지도"
                        />

                        {/* 선택 버튼 */}
                        <div className="px-4 py-4 shrink-0 bg-white border-t border-gray-100">
                            <button
                                onClick={() => handleSelect(mapPoi)}
                                className="w-full py-4 bg-brandBlue text-white font-black text-base rounded-2xl shadow-lg shadow-blue-200 active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                                <MapPin size={18} />
                                여기로 선택
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
